/**
 * @vitest-environment node
 */
import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemorySsiKeyStore, generateLearnerKeyPair } from "@/lib/ssi/keystore";
import { createPassphraseVault } from "@/lib/ssi/session";
import { resolveDidKey } from "@/lib/ssi/did-key";
import { ownershipSignPayload } from "@/lib/ssi/ownership";
import { wrapPrivateKey } from "@/lib/ssi/vault";
import {
  browserOnlyRecoveryLimit,
  ownershipProofBody,
  RECOVERY_KDF,
  RECOVERY_OFFLINE_GUESSING,
  restoreOnThisDevice,
} from "@/lib/ssi/recovery";
import { learnerIdentityError } from "@/lib/ssi/onboarding";
import {
  holderBinding,
  interpretVerifyResponse,
  portableCredential,
  verifyPortableCredential,
} from "@/lib/credentials/portable";
import { exportCredentialCollection, importCredentialPayload } from "@/lib/credentials/collection";

const ed25519Available = typeof crypto !== "undefined"
  && Boolean(crypto.subtle)
  && typeof crypto.subtle.generateKey === "function";

const password = "correct-passphrase";

function verifyDidSignature(did: string, message: string, signature: string): boolean {
  const raw = resolveDidKey(did).publicKey;
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  const key = createPublicKey({
    key: Buffer.concat([prefix, Buffer.from(raw)]),
    format: "der",
    type: "spki",
  });
  return verify(null, Buffer.from(message), key, Buffer.from(signature, "base64url"));
}

describe.skipIf(!ed25519Available)("cross-device learning identity recovery", { timeout: 20000 }, () => {
  it("restores the same DID on a second browser and signs a fresh challenge", async () => {
    const deviceA = new MemorySsiKeyStore();
    const created = await createPassphraseVault(deviceA, "user-1", password, null);
    const recoveryFile = JSON.stringify(created.backup);
    expect(recoveryFile).not.toMatch(/BEGIN PRIVATE KEY|privateKey/);

    const deviceB = new MemorySsiKeyStore();
    let sent: { challengeId: string; did: string; signature: string } | null = null;
    const restored = await restoreOnThisDevice({
      store: deviceB,
      backupRaw: recoveryFile,
      passphrase: password,
      userId: "user-1",
      boundDid: created.identity.did,
      prove: async (record) => {
        sent = await ownershipProofBody(record, {
          challengeId: "11111111-1111-4111-8111-111111111111",
          payload: "SIJIL-SSI-BIND-v1\naudience=sijil-express",
        });
      },
    });

    expect(restored.status).toBe("ready");
    expect(restored.did).toBe(created.identity.did);
    expect(sent?.did).toBe(created.identity.did);
    expect(JSON.stringify(sent)).not.toMatch(/privateKey|BEGIN PRIVATE KEY/);
    expect(verifyDidSignature(
      sent!.did,
      ownershipSignPayload("SIJIL-SSI-BIND-v1\naudience=sijil-express", sent!.did),
      sent!.signature,
    )).toBe(true);
    const saved = await deviceB.loadPersisted("user-1");
    expect(saved && "did" in saved ? saved.did : null).toBe(created.identity.did);
  });

  it("rejects a wrong password and leaves the second browser empty", async () => {
    const created = await createPassphraseVault(new MemorySsiKeyStore(), "user-1", password, null);
    const deviceB = new MemorySsiKeyStore();
    await expect(restoreOnThisDevice({
      store: deviceB,
      backupRaw: JSON.stringify(created.backup),
      passphrase: "wrong-password",
      userId: "user-1",
      boundDid: created.identity.did,
      prove: async () => undefined,
    })).rejects.toThrow(/Incorrect passphrase/);
    expect(await deviceB.loadPersisted("user-1")).toBeNull();
    expect(learnerIdentityError(new Error("Incorrect passphrase"))).toMatch(/cannot reset/);
  });

  it("rejects a corrupted recovery file and a file for another account", async () => {
    const created = await createPassphraseVault(new MemorySsiKeyStore(), "user-1", password, null);
    const corrupted = { ...created.backup, wrap: { ...created.backup.wrap, ciphertext: "" } };
    await expect(restoreOnThisDevice({
      store: new MemorySsiKeyStore(),
      backupRaw: JSON.stringify(corrupted),
      passphrase: password,
      userId: "user-1",
      boundDid: created.identity.did,
      prove: async () => undefined,
    })).rejects.toThrow(/missing wrapped|Incorrect passphrase|malformed/);

    await expect(restoreOnThisDevice({
      store: new MemorySsiKeyStore(),
      backupRaw: JSON.stringify(created.backup),
      passphrase: password,
      userId: "user-2",
      boundDid: created.identity.did,
      prove: async () => undefined,
    })).rejects.toThrow(/different SIJIL account/);
    expect(learnerIdentityError(new Error("This backup belongs to a different SIJIL account"))).toMatch(/another SIJIL account/);
  });

  it("keeps the restored DID when checking the identity is interrupted", async () => {
    const created = await createPassphraseVault(new MemorySsiKeyStore(), "user-1", password, null);
    const deviceB = new MemorySsiKeyStore();
    const first = await restoreOnThisDevice({
      store: deviceB,
      backupRaw: JSON.stringify(created.backup),
      passphrase: password,
      userId: "user-1",
      boundDid: created.identity.did,
      prove: async () => {
        throw new Error("SSI activation is temporarily unavailable");
      },
    });
    expect(first).toEqual({ did: created.identity.did, status: "interrupted" });
    const second = await restoreOnThisDevice({
      store: deviceB,
      backupRaw: JSON.stringify(created.backup),
      passphrase: password,
      userId: "user-1",
      boundDid: created.identity.did,
      prove: async (record) => {
        expect(record.did).toBe(created.identity.did);
      },
    });
    expect(second).toEqual({ did: created.identity.did, status: "ready" });
    expect(learnerIdentityError(new Error("Restoration stopped"))).toMatch(/was not replaced/);
  });

  it("does not export or replace a browser-only identity", async () => {
    const pair = await generateLearnerKeyPair();
    await expect(wrapPrivateKey(pair.privateKey, password)).rejects.toThrow(/non-extractable/);
    const limit = browserOnlyRecoveryLimit();
    expect(limit.canExport).toBe(false);
    expect(limit.canMigrateWithoutNewDid).toBe(false);
    expect(limit.message).toMatch(/will not be created/);
    expect(learnerIdentityError(new Error("This identity uses a non-extractable key and cannot be exported"))).toMatch(/cannot be turned into a recovery file/);
  });

  it("documents that password recovery is not immune to offline guessing", () => {
    expect(RECOVERY_KDF).toMatchObject({
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 310000,
      saltBytes: 16,
      encryption: "AES-GCM",
      minimumPasswordLength: 10,
    });
    expect(RECOVERY_OFFLINE_GUESSING).toMatch(/does not stop guessing/);
    expect(RECOVERY_OFFLINE_GUESSING.toLowerCase()).not.toMatch(/immune/);
  });
});

describe("credential collection on another browser", () => {
  const file = portableCredential({
    document: {
      id: "urn:uuid:sijil:test-cred",
      issuer: "did:web:issuer.cust.edu.pk",
      validFrom: "2026-01-15T00:00:00.000Z",
      credentialSubject: { id: "did:key:z6Mktest", skill: "TypeScript" },
    },
    credentialHash: "ab".repeat(32),
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-jcs-2022",
      created: "2026-01-15T00:00:00.000Z",
      verificationMethod: "did:web:issuer.cust.edu.pk#key-1",
      proofValue: "abc",
      proofPurpose: "assertionMethod",
    },
  });

  it("moves a collection without private keys and ignores duplicates", () => {
    const raw = exportCredentialCollection([file]);
    expect(raw).not.toMatch(/privateKey|BEGIN PRIVATE KEY|service_role/);
    const deviceB = importCredentialPayload([], "user-1", raw);
    expect(deviceB.saved).toBe(1);
    expect(deviceB.records[0].file.credentialHash).toBe(file.credentialHash);
    const again = importCredentialPayload(deviceB.records, "user-1", raw);
    expect(again.duplicates).toBe(1);
    expect(again.records).toHaveLength(1);
  });

  it("keeps holder, revocation, and missing-key results separate from a saved copy", async () => {
    expect(holderBinding(file, "did:key:z6Mkother")).toBe("mismatch");
    expect(interpretVerifyResponse({ status: "revoked", hash: file.credentialHash }).revocation).toBe("revoked");
    expect(await verifyPortableCredential(file, null)).toBe("unavailable");
  });
});

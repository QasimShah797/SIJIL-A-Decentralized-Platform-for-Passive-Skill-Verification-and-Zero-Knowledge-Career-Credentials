/**
 * @vitest-environment node
 */
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@/lib/ssi/canonicalize";
import {
  credentialFilename,
  credentialStatusCopy,
  holderBinding,
  interpretVerifyResponse,
  parsePortableCredential,
  portableCredential,
  selectTrustedIssuerKey,
  serializePortableCredential,
  verifyPortableCredential,
  type PortableCredentialFile,
} from "./portable";
import { importPortableCredential, importPortableJson, listLocalCredentials } from "./collection";

const holderDid = "did:key:z6Mktest";
const document = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "urn:uuid:sijil:test-cred",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: "did:web:issuer.cust.edu.pk",
  validFrom: "2026-01-15T00:00:00.000Z",
  validUntil: "2027-01-15T00:00:00.000Z",
  credentialSubject: {
    id: holderDid,
    skill: "TypeScript",
    evidenceCount: 1,
    evidenceHashes: ["aa"],
  },
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function signedFile(target = document, privatePem?: string, publicPem?: string): {
  file: PortableCredentialFile;
  publicPem: string;
} {
  const keys = privatePem && publicPem
    ? { privatePem, publicPem }
    : (() => {
        const pair = generateKeyPairSync("ed25519");
        return {
          privatePem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          publicPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
        };
      })();
  const credentialHash = sha256(canonicalizeJson(target));
  const proofValue = sign(null, Buffer.from(credentialHash, "hex"), createPrivateKey(keys.privatePem)).toString("base64url");
  return {
    publicPem: keys.publicPem,
    file: portableCredential({
      document: target,
      credentialHash,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-jcs-2022",
        created: "2026-01-15T00:00:00.000Z",
        verificationMethod: "did:web:issuer.cust.edu.pk#key-1",
        proofValue,
        proofPurpose: "assertionMethod",
      },
    }),
  };
}

describe("learner credential wallet", () => {
  it("downloads the signed document, original signature, and hash as JSON", () => {
    const { file } = signedFile();
    const raw = serializePortableCredential(file);
    const parsed = JSON.parse(raw) as PortableCredentialFile;
    expect(parsed.document).toEqual(document);
    expect(parsed.proof.proofValue).toBe(file.proof.proofValue);
    expect(parsed.credentialHash).toBe(file.credentialHash);
    expect(credentialFilename(file)).toBe("sijil-credential-typescript.json");
    expect(raw).not.toMatch(/privateKey|BEGIN PRIVATE KEY|service_role/);
  });

  it("round-trips a credential file without changing the signed document", () => {
    const { file } = signedFile();
    const restored = parsePortableCredential(serializePortableCredential(file));
    expect(restored.document).toEqual(file.document);
    expect(restored.credentialHash).toBe(file.credentialHash);
    expect(restored.proof).toEqual(file.proof);
  });

  it("rejects a tampered document and keeps the stored hash", async () => {
    const { file, publicPem } = signedFile();
    const tampered = parsePortableCredential(serializePortableCredential({
      ...file,
      document: {
        ...file.document,
        credentialSubject: { ...(file.document.credentialSubject as object), skill: "Java" },
      },
    }));
    expect(tampered.credentialHash).toBe(file.credentialHash);
    expect(await verifyPortableCredential(tampered, publicPem)).toBe("invalid");
  });

  it("ignores an issuer key packed inside the credential file", async () => {
    const trusted = signedFile();
    const attacker = generateKeyPairSync("ed25519");
    const attackerPem = attacker.publicKey.export({ type: "spki", format: "pem" }).toString();
    const raw = serializePortableCredential(trusted.file).replace(
      "\n}",
      `,\n  "publicKeyPem": ${JSON.stringify(attackerPem)}\n}`,
    );
    const parsed = parsePortableCredential(raw);
    expect(JSON.stringify(parsed)).not.toContain("BEGIN PUBLIC KEY");
    expect(selectTrustedIssuerKey(parsed, trusted.publicPem)).toBe(trusted.publicPem);
    expect(await verifyPortableCredential(parsed, trusted.publicPem)).toBe("valid");
    expect(await verifyPortableCredential(parsed, attackerPem)).toBe("invalid");
  });

  it("does not overwrite a saved credential with a duplicate or a different file", () => {
    const first = signedFile();
    const saved = importPortableCredential([], "user-1", first.file, "2026-01-15T00:00:00.000Z");
    const duplicate = importPortableJson(saved.records, "user-1", serializePortableCredential(first.file));
    expect(duplicate.outcome).toBe("duplicate");
    expect(duplicate.records).toHaveLength(1);

    const otherDocument = { ...document, id: document.id, credentialSubject: { ...document.credentialSubject, skill: "Java" } };
    const conflict = importPortableCredential(saved.records, "user-1", signedFile(otherDocument).file);
    expect(conflict.outcome).toBe("conflict");
    expect(conflict.records[0].file.credentialHash).toBe(first.file.credentialHash);
  });

  it("reports a holder mismatch without replacing the credential", () => {
    const { file } = signedFile();
    expect(holderBinding(file, "did:key:z6Mkother")).toBe("mismatch");
    expect(holderBinding(file, holderDid)).toBe("match");
    expect(credentialStatusCopy({
      signature: "valid",
      revocation: "active",
      blockchain: "anchored",
      holder: "mismatch",
    })).toMatch(/different learning identity/);
  });

  it("shows an empty local collection when nothing has been saved", () => {
    expect(listLocalCredentials([], "user-1")).toEqual([]);
  });

  it("keeps a revoked credential from being described as currently valid", () => {
    const status = interpretVerifyResponse({ status: "revoked", hash: "a".repeat(64) });
    expect(status.revocation).toBe("revoked");
    expect(status.integrity).toBe("ok");
    const copy = credentialStatusCopy({
      signature: "valid",
      revocation: status.revocation,
      blockchain: status.blockchain,
      holder: "match",
    });
    expect(copy).toMatch(/revoked/);
    expect(copy).toMatch(/not currently valid/);
    expect(copy).not.toMatch(/blockchain record matches/);
  });

  it("does not treat a stored-record mismatch as currently valid", () => {
    const copy = credentialStatusCopy({
      signature: "valid",
      revocation: "unknown",
      blockchain: "unknown",
      holder: "match",
      integrity: interpretVerifyResponse({ status: "tampered", hash: "ab".repeat(32) }).integrity,
    });
    expect(copy).toMatch(/does not match its stored record/);
    expect(copy).toMatch(/not currently valid/);
  });

  it("fails safely when the verification service cannot be reached", async () => {
    const { file } = signedFile();
    expect(interpretVerifyResponse(null)).toEqual({
      source: "unavailable",
      revocation: "unknown",
      blockchain: "unavailable",
      integrity: "unknown",
    });
    expect(await verifyPortableCredential(file, null)).toBe("unavailable");
    expect(credentialStatusCopy({
      signature: "unavailable",
      revocation: "unknown",
      blockchain: "unavailable",
      holder: "match",
    })).toMatch(/could not be checked/);
  });

  it("accepts a credential signed the same way existing SIJIL credentials are signed", async () => {
    const { file, publicPem } = signedFile();
    expect(file.credentialHash).toBe(sha256(canonicalizeJson(document)));
    expect(file.document).not.toHaveProperty("proof");
    expect(await verifyPortableCredential(file, publicPem)).toBe("valid");
    expect(credentialStatusCopy({
      signature: "valid",
      revocation: "active",
      blockchain: "pending",
      holder: "match",
    })).toMatch(/not ready/);
  });
});

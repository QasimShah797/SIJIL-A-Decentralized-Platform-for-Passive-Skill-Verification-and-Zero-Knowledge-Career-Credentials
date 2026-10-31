import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { signSha256Hash } from "../utils/ed25519";
import { buildCredentialDocument, type CredentialDocument } from "./credential-document.service";
import type { CredentialVerifyResult } from "./credential-verify";
import { SsiPresentationChallengeStore } from "./ssi-presentation-challenge.store";
import {
  SsiPresentationService,
  type PresentationCredentialSource,
} from "./ssi-presentation.service";
import {
  presentationSignBytes,
  type IssuerCredentialProof,
} from "./ssi-presentation-protocol";

const DART_ID = "6916c346-333b-4bd5-9f15-b75b1f54e50b";
const LEARNER = "6958504f-5c95-4bff-8e88-bf737778584e";

function learnerKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.byteLength - 32));
  return {
    privateKey,
    did: encodeDidKeyFromRawPublicKey(raw),
  };
}

function issuerProof(document: CredentialDocument, hash: string): IssuerCredentialProof {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: document.validFrom,
    verificationMethod: `${document.issuer}#key-1`,
    proofValue: signSha256Hash(hash, pem),
    proofPurpose: "assertionMethod",
  };
}

function sourceFor(holderDid: string, userId = LEARNER): PresentationCredentialSource {
  const built = buildCredentialDocument({
    credentialUri: "urn:uuid:sijil:test:dart",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid,
    skill: "Dart",
    evidenceCount: 1,
    evidenceHashes: ["aa".repeat(32)],
    validFrom: "2026-10-16T18:00:00.000Z",
  });
  return {
    id: DART_ID,
    userId,
    holderDid,
    document: built.document,
    proof: issuerProof(built.document, built.sha256Hash),
    hash: built.sha256Hash,
    revokedAt: null,
  };
}

function verified(id: string): CredentialVerifyResult {
  return {
    status: "verified",
    credentialId: id,
    hash: "ab".repeat(32),
    anchorTxId: "tx",
    anchoredAt: "2026-10-16T18:30:00.000Z",
    verifiedAt: "2026-10-16T19:01:00.000Z",
  };
}

function serviceFor(
  row: PresentationCredentialSource,
  holderDid: string,
  now = () => Date.now(),
  records?: import("./ssi-presentation-record.store").MemoryPresentationRecordStore,
) {
  const store = new SsiPresentationChallengeStore(now);
  return new SsiPresentationService({
    loadCredentials: async (ids) => ids.includes(row.id) || ids.includes("urn:uuid:sijil:test:dart") ? [row] : [],
    requireHolderDid: async (userId) => {
      if (userId !== row.userId) throw new Error("wrong user");
      return holderDid;
    },
    verifyIssued: async (id) => verified(id),
  }, store, records);
}

describe("learner-signed presentation service", () => {
  it("creates a valid holder signature and verifies issuer/ledger separately", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID], audience: "https://sijil.example/verify" });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const view = await svc.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.kind, "learner-signed-vp");
    assert.equal(view.holderProof.ok, true);
    assert.equal(view.credentials[0]?.issuerAndLedger.status, "verified");
    assert.equal(view.credentials[0]?.issuerIntegrity.ok, true);
    assert.equal(view.credentials[0]?.blockchain.ok, true);
    assert.equal(view.credentials[0]?.holderBound, true);
  });

  it("rejects an invalid signature without consuming the challenge", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature: "a".repeat(86) }),
      /invalid|canonical|signature/i,
    );
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    assert.ok(stored.id);
  });

  it("rejects the wrong holder DID", async () => {
    const keys = learnerKeys();
    const other = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: other.did, signature }),
      /holder|DID/i,
    );
  });

  it("rejects a signature over a different audience", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID], audience: "https://sijil.example/verify" });
    const tampered = {
      ...challenge.claims,
      audience: "https://attacker.example/verify",
    };
    const signature = sign(null, presentationSignBytes(tampered), keys.privateKey).toString("base64url");
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      /invalid/i,
    );
  });

  it("rejects replay of a consumed challenge", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      /already been used/,
    );
  });

  it("atomically rejects concurrent consume of the same nonce", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const store = new SsiPresentationChallengeStore();
    const svc = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, store);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const results = await Promise.allSettled([
      svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
    ]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });

  it("rejects historical placeholder credentials", async () => {
    const keys = learnerKeys();
    const placeholder = "did:key:z6Mk" + "c".repeat(40);
    const row = sourceFor(placeholder);
    const svc = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    await assert.rejects(
      () => svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] }),
      /historical placeholder/,
    );
  });

  it("rejects an expired challenge", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    let now = Date.parse("2026-10-16T19:00:00.000Z");
    const svc = serviceFor(row, keys.did, () => now);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    now = Date.parse("2026-10-16T19:20:00.000Z");
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      /expired/,
    );
  });

  it("persists presentations so verification survives a process restart", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const sharedRecords = new MemoryPresentationRecordStore();
    const challengeStore = new SsiPresentationChallengeStore();
    const writer = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, challengeStore, sharedRecords);
    const challenge = await writer.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await writer.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });

    // Simulate restart: new service process, same durable stores (DB / shared memory).
    const reader = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, challengeStore, sharedRecords);
    const view = await reader.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.holderProof.ok, true);
    assert.equal(view.presentationId, stored.id);
  });

  it("lets a second backend instance verify a presentation written by the first", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const sharedRecords = new MemoryPresentationRecordStore();
    const sharedChallenges = new SsiPresentationChallengeStore();
    const deps = {
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id: string) => verified(id),
    };
    const instanceA = new SsiPresentationService(deps, sharedChallenges, sharedRecords);
    const instanceB = new SsiPresentationService(deps, sharedChallenges, sharedRecords);
    const challenge = await instanceA.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await instanceA.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const view = await instanceB.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.holderProof.ok, true);
  });

  it("reports expired holder proofs from durable records without trusting the client", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const view = await svc.verify(stored.id, new Date("2099-01-01T00:00:00.000Z"));
    assert.equal(view.holderProof.ok, false);
    assert.equal(view.holderProof.reason, "expired");
  });

  it("lets the owner revoke a presentation and rejects public verification afterward", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const records = new MemoryPresentationRecordStore();
    const svc = serviceFor(row, keys.did, () => Date.now(), records);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const revoked = await svc.revoke(LEARNER, stored.id);
    assert.equal(revoked.alreadyRevoked, false);
    assert.ok(revoked.revokedAt);
    await assert.rejects(() => svc.verify(stored.id), (error: unknown) => {
      const err = error as { statusCode?: number; message?: string };
      return err.statusCode === 410 && /revoked/i.test(err.message ?? "");
    });
    await assert.rejects(() => svc.getEnvelope(stored.id), (error: unknown) => {
      return (error as { statusCode?: number }).statusCode === 410;
    });
    // Underlying credential remains present and unrevoked.
    assert.equal(row.revokedAt, null);
  });

  it("forbids another learner from revoking a presentation", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    await assert.rejects(
      () => svc.revoke("11111111-1111-4111-8111-111111111111", stored.id),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 403,
    );
    const view = await svc.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.holderProof.ok, true);
  });

  it("keeps other presentations valid when one is revoked", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const records = new MemoryPresentationRecordStore();
    const svc = serviceFor(row, keys.did, () => Date.now(), records);
    const firstChallenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const firstSig = sign(null, presentationSignBytes(firstChallenge.claims), keys.privateKey).toString("base64url");
    const first = await svc.submit(LEARNER, { challengeId: firstChallenge.id, did: keys.did, signature: firstSig });
    const secondChallenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const secondSig = sign(null, presentationSignBytes(secondChallenge.claims), keys.privateKey).toString("base64url");
    const second = await svc.submit(LEARNER, { challengeId: secondChallenge.id, did: keys.did, signature: secondSig });
    await svc.revoke(LEARNER, first.id);
    await assert.rejects(() => svc.verify(first.id), /revoked/i);
    const view = await svc.verify(second.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.holderProof.ok, true);
    assert.equal(view.presentationId, second.id);
  });

  it("treats repeated revoke as idempotent", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const first = await svc.revoke(LEARNER, stored.id);
    const second = await svc.revoke(LEARNER, stored.id);
    assert.equal(first.alreadyRevoked, false);
    assert.equal(second.alreadyRevoked, true);
    assert.equal(first.revokedAt, second.revokedAt);
  });

  it("keeps revocation durable across a simulated backend restart", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const sharedRecords = new MemoryPresentationRecordStore();
    const challengeStore = new SsiPresentationChallengeStore();
    const deps = {
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id: string) => verified(id),
    };
    const writer = new SsiPresentationService(deps, challengeStore, sharedRecords);
    const challenge = await writer.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await writer.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    await writer.revoke(LEARNER, stored.id);
    const reader = new SsiPresentationService(deps, challengeStore, sharedRecords);
    await assert.rejects(() => reader.verify(stored.id), (error: unknown) => {
      return (error as { statusCode?: number }).statusCode === 410;
    });
  });

  it("does not report revoke success when durable storage fails", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const store = new SsiPresentationChallengeStore();
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const real = new MemoryPresentationRecordStore();
    const svcWrite = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, store, real);
    const challenge = await svcWrite.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svcWrite.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const failing = {
      insert: real.insert.bind(real),
      getById: real.getById.bind(real),
      deleteById: real.deleteById.bind(real),
      revokeForOwner: async () => {
        throw Object.assign(new Error("revoke failed"), { statusCode: 503 });
      },
    };
    const svcFail = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, store, failing);
    await assert.rejects(
      () => svcFail.revoke(LEARNER, stored.id),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 503,
    );
    const stillOk = await svcWrite.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(stillOk.holderProof.ok, true);
  });

  it("distinguishes expired holder proofs from revoked presentations", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const expired = await svc.verify(stored.id, new Date("2099-01-01T00:00:00.000Z"));
    assert.equal(expired.holderProof.ok, false);
    assert.equal(expired.holderProof.reason, "expired");
    await svc.revoke(LEARNER, stored.id);
    await assert.rejects(() => svc.verify(stored.id, new Date("2099-01-01T00:00:00.000Z")), /revoked/i);
  });

  it("does not report success when durable storage fails", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const store = new SsiPresentationChallengeStore();
    const failingRecords = {
      insert: async () => {
        throw Object.assign(new Error("insert failed"), { statusCode: 503 });
      },
      getById: async () => null,
      deleteById: async () => undefined,
      revokeForOwner: async () => {
        throw Object.assign(new Error("unused"), { statusCode: 503 });
      },
    };
    const svc = new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, store, failingRecords);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 503,
    );
    // Challenge remains usable after a failed persist.
    const stored = await new SsiPresentationService({
      loadCredentials: async () => [row],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    }, store).submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    assert.ok(stored.id);
  });

  it("rejects cross-user submission of another learner's challenge", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    await assert.rejects(
      () => svc.submit("11111111-1111-4111-8111-111111111111", {
        challengeId: challenge.id,
        did: keys.did,
        signature,
      }),
      /different account/i,
    );
  });

  it("rejects a modified credential document instead of trusting client-supplied bytes", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    let current = row;
    const svc = new SsiPresentationService({
      loadCredentials: async () => [current],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    current = {
      ...row,
      document: {
        ...row.document,
        credentialSubject: {
          ...row.document.credentialSubject,
          skill: "Hacked",
        },
      },
    };
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      /hash does not match/,
    );
  });

  it("rejects an empty credential selection", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    await assert.rejects(
      () => svc.issueChallenge(LEARNER, { credentialIds: [] }),
      /non-empty/i,
    );
  });

  it("binds only the selected credentials into the signed presentation", async () => {
    const keys = learnerKeys();
    const dart = sourceFor(keys.did);
    const ts = {
      ...sourceFor(keys.did),
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      document: {
        ...sourceFor(keys.did).document,
        id: "urn:uuid:sijil:test:ts",
        credentialSubject: {
          ...sourceFor(keys.did).document.credentialSubject,
          skill: "TypeScript",
        },
      },
    };
    // Recompute hash for the modified document.
    const { hashUnsignedCredentialDocument } = await import("./ssi-presentation-protocol");
    const tsHash = hashUnsignedCredentialDocument(ts.document);
    const tsRow = { ...ts, hash: tsHash, proof: issuerProof(ts.document, tsHash) };
    const catalog = new Map([[dart.id, dart], [tsRow.id, tsRow]]);
    const svc = new SsiPresentationService({
      loadCredentials: async (ids) => ids.map((id) => catalog.get(id)).filter(Boolean) as typeof dart[],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [dart.id] });
    assert.equal(challenge.credentials.length, 1);
    assert.equal(challenge.credentials[0]?.id, dart.id);
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const view = await svc.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.credentials.length, 1);
    assert.equal(view.credentials[0]?.credentialId, dart.id);
    assert.equal(view.credentials[0]?.skill, "Dart");
    assert.equal(stored.envelope.sijilCredentialIds.includes(tsRow.id), false);
  });

  it("supports multiple selected credentials and keeps hashes bound", async () => {
    const keys = learnerKeys();
    const dart = sourceFor(keys.did);
    const { hashUnsignedCredentialDocument } = await import("./ssi-presentation-protocol");
    const tsDoc = {
      ...dart.document,
      id: "urn:uuid:sijil:test:ts",
      credentialSubject: { ...dart.document.credentialSubject, skill: "TypeScript" },
    };
    const tsHash = hashUnsignedCredentialDocument(tsDoc);
    const tsRow = {
      ...dart,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      document: tsDoc,
      hash: tsHash,
      proof: issuerProof(tsDoc, tsHash),
    };
    const catalog = new Map([[dart.id, dart], [tsRow.id, tsRow]]);
    const svc = new SsiPresentationService({
      loadCredentials: async (ids) => ids.map((id) => catalog.get(id)).filter(Boolean) as typeof dart[],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [tsRow.id, dart.id] });
    assert.equal(challenge.credentials.length, 2);
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const view = await svc.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.credentials.length, 2);
    const ids = new Set(view.credentials.map((row) => row.credentialId));
    assert.equal(ids.has(dart.id), true);
    assert.equal(ids.has(tsRow.id), true);
  });

  it("rejects cross-user credential injection into a challenge", async () => {
    const keys = learnerKeys();
    const own = sourceFor(keys.did);
    const foreign = {
      ...sourceFor(keys.did, "11111111-1111-4111-8111-111111111111"),
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const catalog = new Map([[own.id, own], [foreign.id, foreign]]);
    const svc = new SsiPresentationService({
      loadCredentials: async (ids) => ids.map((id) => catalog.get(id)).filter(Boolean) as typeof own[],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    await assert.rejects(
      () => svc.issueChallenge(LEARNER, { credentialIds: [own.id, foreign.id] }),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 403,
    );
  });

  it("rejects a challenge credential set that does not match the active holder DID", async () => {
    const keys = learnerKeys();
    const other = learnerKeys();
    const mismatched = sourceFor(other.did);
    const svc = new SsiPresentationService({
      loadCredentials: async () => [mismatched],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id) => verified(id),
    });
    await assert.rejects(
      () => svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] }),
      /holder DID does not match/i,
    );
  });

  it("rejects a signature over a tampered selected credential hash", async () => {
    const keys = learnerKeys();
    const row = sourceFor(keys.did);
    const svc = serviceFor(row, keys.did);
    const challenge = await svc.issueChallenge(LEARNER, { credentialIds: [DART_ID] });
    const tampered = {
      ...challenge.claims,
      credentials: [{
        id: challenge.claims.credentials[0]!.id,
        hash: "ff".repeat(32),
      }],
    };
    const signature = sign(null, presentationSignBytes(tampered), keys.privateKey).toString("base64url");
    await assert.rejects(
      () => svc.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature }),
      /invalid/i,
    );
  });

  it("keeps selective presentations durable across restart and honors revocation", async () => {
    const { MemoryPresentationRecordStore } = await import("./ssi-presentation-record.store");
    const keys = learnerKeys();
    const dart = sourceFor(keys.did);
    const { hashUnsignedCredentialDocument } = await import("./ssi-presentation-protocol");
    const tsDoc = {
      ...dart.document,
      id: "urn:uuid:sijil:test:ts2",
      credentialSubject: { ...dart.document.credentialSubject, skill: "TypeScript" },
    };
    const tsHash = hashUnsignedCredentialDocument(tsDoc);
    const tsRow = {
      ...dart,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      document: tsDoc,
      hash: tsHash,
      proof: issuerProof(tsDoc, tsHash),
    };
    const catalog = new Map([[dart.id, dart], [tsRow.id, tsRow]]);
    const sharedRecords = new MemoryPresentationRecordStore();
    const challengeStore = new SsiPresentationChallengeStore();
    const deps = {
      loadCredentials: async (ids: string[]) => ids.map((id) => catalog.get(id)).filter(Boolean) as typeof dart[],
      requireHolderDid: async () => keys.did,
      verifyIssued: async (id: string) => verified(id),
    };
    const writer = new SsiPresentationService(deps, challengeStore, sharedRecords);
    const challenge = await writer.issueChallenge(LEARNER, { credentialIds: [tsRow.id] });
    const signature = sign(null, presentationSignBytes(challenge.claims), keys.privateKey).toString("base64url");
    const stored = await writer.submit(LEARNER, { challengeId: challenge.id, did: keys.did, signature });
    const reader = new SsiPresentationService(deps, challengeStore, sharedRecords);
    const view = await reader.verify(stored.id, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(view.credentials.length, 1);
    assert.equal(view.credentials[0]?.credentialId, tsRow.id);
    await reader.revoke(LEARNER, stored.id);
    await assert.rejects(() => reader.verify(stored.id), /revoked/i);
  });
});

describe("public VP disclosure fail-closed", () => {
  it("withholds exact marks and commit counts when disclosure prefs are OFF", async () => {
    const { redactExactValues } = await import("../utils/exact-value-redaction");
    const { DEFAULT_DISCLOSURE_PREFERENCES } = await import("./disclosure-preferences.service");
    const payload = {
      presentationId: "11111111-1111-4111-8111-111111111111",
      holderDid: "did:key:z6Mk",
      envelope: {
        verifiableCredential: [{
          credentialSubject: {
            skill: "Dart",
            scorePercent: 91,
            commit_count: 83,
          },
        }],
      },
      verification: { credentials: [{ credentialId: "x", skill: "Dart" }] },
      kind: "learner-signed-vp",
    };
    const out = redactExactValues(payload, DEFAULT_DISCLOSURE_PREFERENCES, "2026-10-31T00:00:00.000Z");
    const text = JSON.stringify(out);
    assert.equal(text.includes("91"), false);
    assert.equal(text.includes("83"), false);
    assert.equal(text.includes("scorePercent"), false);
    assert.equal(text.includes("commit_count"), false);
    assert.match(text, /"skill":"Dart"/);
  });
});

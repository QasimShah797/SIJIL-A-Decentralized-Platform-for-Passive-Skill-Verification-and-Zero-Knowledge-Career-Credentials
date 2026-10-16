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

function serviceFor(row: PresentationCredentialSource, holderDid: string, now = () => Date.now()) {
  const store = new SsiPresentationChallengeStore(now);
  return new SsiPresentationService({
    loadCredentials: async (ids) => ids.includes(row.id) || ids.includes("urn:uuid:sijil:test:dart") ? [row] : [],
    requireHolderDid: async (userId) => {
      if (userId !== row.userId) throw new Error("wrong user");
      return holderDid;
    },
    verifyIssued: async (id) => verified(id),
  }, store);
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
});

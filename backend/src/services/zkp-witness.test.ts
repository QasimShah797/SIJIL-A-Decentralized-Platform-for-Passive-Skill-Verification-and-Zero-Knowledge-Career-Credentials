import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { ROLES } from "../constants/roles";
import { evaluateOwnerWitness, type ArtifactHashes, type WitnessCredential } from "./zkp-witness";
import type { AssessmentAttemptRecord } from "./assessment-binding";

const LEARNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185450";
const HASHES: ArtifactHashes = {
  wasm: "aa".repeat(32),
  zkey: "bb".repeat(32),
  verificationKey: "cc".repeat(32),
};

const keys = generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

function signedCredential(documentOverrides?: { circuitId?: string; omit?: boolean }): WitnessCredential {
  const built = buildCredentialDocument({
    credentialUri: "urn:uuid:sijil:test:circuits",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6Mktest",
    skill: "Circuits",
    evidenceCount: 1,
    evidenceHashes: ["abc"],
    validFrom: "2026-10-17T00:00:00.000Z",
    ...(documentOverrides?.omit ? {} : {
      assessmentCommitment: {
        version: 1,
        scheme: "poseidon-bn254-v1",
        circuitId: documentOverrides?.circuitId ?? "score-threshold-v1",
        attemptId: ATTEMPT,
        commitment: COMMITMENT,
      },
    }),
  });
  return {
    userId: LEARNER,
    credentialUri: built.document.id,
    credentialHash: built.sha256Hash,
    credentialDocument: built.document,
    proofValue: signSha256Hash(built.sha256Hash, privatePem),
    revokedAt: null,
  };
}

function attempt(): AssessmentAttemptRecord {
  return {
    id: ATTEMPT,
    learnerUserId: LEARNER,
    skillId: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    passed: true,
    percentage: 73,
    commitment: COMMITMENT,
    commitmentScheme: "poseidon-bn254-v1",
    commitmentCircuitId: "score-threshold-v1",
    commitmentVersion: 1,
    submittedAt: "2026-10-17T00:00:00.000Z",
    createdAt: "2026-10-16T00:00:00.000Z",
  };
}

function opening(blinding = "42") {
  return { score: 73, blinding, learnerId: LEARNER, attemptId: ATTEMPT };
}

function verify(hashHex: string, proofValue: string): boolean {
  return verifySha256Hash(hashHex, proofValue, publicPem);
}

describe("owner assessment witness", () => {
  it("returns the owner witness for the signed commitment", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: signedCredential(),
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.witness.credentialId, "urn:uuid:sijil:test:circuits");
    assert.equal(decision.witness.commitment, COMMITMENT);
    assert.equal(decision.witness.circuitId, "score-threshold-v1");
    assert.equal(decision.witness.witness.score, "73");
    assert.equal(decision.witness.witness.blinding, "42");
    assert.equal(decision.witness.artifactHashes, HASHES);
    assert.equal(JSON.stringify(decision.witness).includes("answer"), false);
  });

  it("rejects another learner", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: OTHER,
      callerRoles: [ROLES.LEARNER],
      credential: signedCredential(),
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 403);
  });

  it("rejects a recruiter even when the user id matches the owner", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.RECRUITER],
      credential: signedCredential(),
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 403);
    assert.equal(decision.message.includes("73"), false);
  });

  it("rejects a credential without an assessment commitment", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: signedCredential({ omit: true }),
      attempt: null,
      opening: null,
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 409);
    assert.match(decision.message, /no trusted assessment commitment/);
  });

  it("rejects a revoked credential", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: { ...signedCredential(), revokedAt: "2026-10-17T01:00:00.000Z" },
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.match(decision.message, /Revoked/);
  });

  it("rejects a tampered credential", async () => {
    const credential = signedCredential();
    const tampered = structuredClone(credential.credentialDocument) as { credentialSubject: { skill: string } };
    tampered.credentialSubject.skill = "Changed";
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: { ...credential, credentialDocument: tampered },
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.match(decision.message, /not a valid signed credential/);
  });

  it("rejects an opening that does not match the signed commitment", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: signedCredential(),
      attempt: attempt(),
      opening: opening("43"),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.match(decision.message, /does not match the trusted opening/);
    assert.equal(decision.message.includes("43"), false);
  });

  it("rejects an unsupported circuit", async () => {
    const decision = await evaluateOwnerWitness({
      callerUserId: LEARNER,
      callerRoles: [ROLES.LEARNER],
      credential: signedCredential({ circuitId: "score-threshold-v2" }),
      attempt: attempt(),
      opening: opening(),
      artifactHashes: HASHES,
      verifySignature: verify,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.match(decision.message, /unsupported assessment circuit/);
  });
});

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { after, before, it } from "node:test";
import type { CredentialRow } from "../types/credentials.types";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { buildSelectiveDisclosureProof, hashDisclosurePayload } from "./proof.service";
import { verifySharedPrivateResults } from "./shared-zkp-verification";
import { signSha256Hash, verifySha256Hash } from "./signing.service";
import { GITHUB_ZKP_TYPE, SHARE_GITHUB_POLICY_VERSION, SHARE_GITHUB_THRESHOLD } from "./zkp-policy";

const learner = "123e4567-e89b-42d3-a456-426614174000";
const snapshot = "223e4567-e89b-42d3-a456-426614174000";
const recruiter = "323e4567-e89b-42d3-a456-426614174000";
const competency = "423e4567-e89b-42d3-a456-426614174000";
const credentialId = "523e4567-e89b-42d3-a456-426614174000";
const keys = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const document = { id: "urn:test:credential", credentialSubject: { skillName: "GitHub test" } };
const hash = recomputeStoredDocumentHash(document)!;
const credential: CredentialRow = {
  id: credentialId, user_id: learner, credential_uri: document.id, credential_document: document,
  credential_hash: hash, proof: { proofValue: signSha256Hash(hash, keys.privateKey) },
  name: "GitHub test", credential_types: [], issuer_name: "Test issuer",
  issuer_did: "did:test:issuer", holder_did: "did:test:holder",
  valid_from: "2026-01-01T00:00:00Z", skill_name: "GitHub test",
  verification_status: "verified", attestation_status: "approved", supporting_records: 0,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
let attachment: Record<string, unknown>;

before(async () => {
  const module = await loadGitHubCommitmentModule();
  const created = await module.createGitHubCommitment({ count: 51, learnerId: learner, snapshotId: snapshot });
  const commitment = created.publicCommitment.commitment;
  const generated = await generateGitHubContributionProof({
    ...created.opening, commitment, threshold: SHARE_GITHUB_THRESHOLD,
  });
  attachment = {
    ...generated, commitment, credentialId, snapshotId: snapshot, circuitId: GITHUB_ZKP_TYPE,
    claimType: "github_activity", policyId: SHARE_GITHUB_POLICY_VERSION, threshold: "50",
  };
});

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  await curve?.terminate?.();
});

function signedRow(proof = attachment, expiresAt = "2099-01-01T00:00:00Z") {
  const payload = {
    shareKind: "direct-recruiter", recipientUserId: recruiter,
    selectiveDisclosure: { credentialId },
    evidenceModes: { github_evidence: "private", lms_evidence: "private", peer_reviews: "private" },
    privateResults: [{ claimType: "moodle_learning", status: "confirmed" }, { claimType: "peer_review", status: "confirmed" }],
    zkProofs: [proof],
  };
  const payloadHash = hashDisclosurePayload(payload);
  const createdAt = "2026-01-01T00:00:00Z";
  const signed = buildSelectiveDisclosureProof({
    learnerDid: null, competencyId: competency, learnerId: learner, payloadHash, createdAt, expiresAt,
  });
  return {
    learner_id: learner, competency_id: competency, disclosed_payload: payload, created_at: createdAt,
    expires_at: expiresAt, payload_hash: payloadHash, proof_value: signed.proofValue,
    verification_method: signed.verificationMethod,
  };
}

const sources = {
  async loadCredential() { return credential; },
  verifyIssuer: (hashHex: string, proof: string) => verifySha256Hash(hashHex, proof, keys.publicKey),
  async credentialActive() { return true; },
  async assessmentLinked() { return false; },
  async githubCommitment() { return String(attachment.commitment); },
};

function statuses(payload: Record<string, unknown>): unknown[] {
  return (payload.privateResults as Array<{ status: unknown }> | undefined)?.map((r) => r.status) ?? [];
}

it("verifies a real Groth16 proof for the authorized recipient and returns only safe result metadata", async () => {
  const result = await verifySharedPrivateResults(signedRow(), { recruiterUserId: recruiter }, sources);
  assert.deepEqual(statuses(result), ["confirmed", "unavailable", "unavailable"]);
  assert.equal((result.privateResults as Array<{ threshold: string }>)[0].threshold, "50");
  assert.equal("zkProofs" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /blinding|contributionCount|witness|publicSignals/);
});

it("rejects a tampered proof even with a valid share signature", async () => {
  const proof = { ...(attachment.proof as object), pi_a: ["2", "2", "1"] };
  const result = await verifySharedPrivateResults(signedRow({ ...attachment, proof }), { recruiterUserId: recruiter }, sources);
  assert.deepEqual(statuses(result), ["failed", "unavailable", "unavailable"]);
});

it("rejects a valid proof with the wrong credential, threshold, or authoritative commitment", async () => {
  for (const row of [
    signedRow({ ...attachment, credentialId: competency }),
    signedRow({ ...attachment, threshold: "49" }),
    signedRow({ ...attachment, publicSignals: ["49", attachment.commitment] }),
  ]) {
    assert.equal(statuses(await verifySharedPrivateResults(row, { recruiterUserId: recruiter }, sources))[0], "failed");
  }
  const rejected = await verifySharedPrivateResults(signedRow(), { recruiterUserId: recruiter }, {
    ...sources, async githubCommitment() { return "1"; },
  });
  assert.equal(statuses(rejected)[0], "failed");
});

it("rejects unauthorized, expired, revoked, and tampered shares before loading evidence", async () => {
  let reads = 0;
  const guardedSources = { ...sources, async loadCredential() { reads++; return credential; } };
  const row = signedRow();
  for (const [candidate, audience] of [
    [row, { recruiterUserId: learner }],
    [row, { bearerLink: true as const }],
    [signedRow(attachment, "2026-02-01T00:00:00Z"), { recruiterUserId: recruiter }],
    [{ ...row, revoked_at: "2026-02-01T00:00:00Z" }, { recruiterUserId: recruiter }],
    [{ ...row, disclosed_payload: { ...row.disclosed_payload, recipientUserId: learner } }, { recruiterUserId: learner }],
  ] as const) {
    assert.deepEqual(statuses(await verifySharedPrivateResults(candidate, audience, guardedSources)), []);
  }
  assert.equal(reads, 0);
});

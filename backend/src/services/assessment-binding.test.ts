import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { evaluateCredentialVerification, type CredentialVerifySnapshot } from "./credential-verify";
import type { LedgerPort, VerifyCredentialResult } from "./ledger.types";
import { processOneAnchor, type AnchorOutboxStore, type OutboxCredential } from "./anchor-outbox";
import { issueCredentialSchema } from "../validators/credentials.validator";
import {
  assertTrustedOpening,
  selectTrustedAssessmentAttempt,
  TRUSTED_CIRCUIT_ID,
  TRUSTED_COMMITMENT_SCHEME,
  TRUSTED_COMMITMENT_VERSION,
  type AssessmentAttemptRecord,
} from "./assessment-binding";

const LEARNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_LEARNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SKILL = "11111111-1111-4111-8111-111111111111";
const OTHER_SKILL = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LATER_ATTEMPT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185450";

const sampleInput = {
  credentialUri: "urn:uuid:sijil:bound-cred",
  issuerDid: "did:web:issuer.cust.edu.pk",
  holderDid: "did:key:z6Mktest",
  skill: "TypeScript",
  evidenceCount: 1,
  evidenceHashes: ["abc"],
  validFrom: "2026-10-17T00:00:00.000Z",
};

function attempt(overrides: Partial<AssessmentAttemptRecord> = {}): AssessmentAttemptRecord {
  return {
    id: ATTEMPT,
    learnerUserId: LEARNER,
    skillId: SKILL,
    status: "completed",
    passed: true,
    percentage: 73,
    commitment: COMMITMENT,
    commitmentScheme: TRUSTED_COMMITMENT_SCHEME,
    commitmentCircuitId: TRUSTED_CIRCUIT_ID,
    commitmentVersion: TRUSTED_COMMITMENT_VERSION,
    submittedAt: "2026-10-17T00:00:00.000Z",
    createdAt: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

function opening() {
  return {
    score: 73,
    blinding: "42",
    learnerId: LEARNER,
    attemptId: ATTEMPT,
  };
}

function ledgerStub(result: VerifyCredentialResult, seen: string[] = []): LedgerPort {
  return {
    isEnabled: () => true,
    isReachable: async () => true,
    anchorCredential: async (input) => {
      seen.push(input.hash);
      return { txId: "tx-bound" };
    },
    revokeCredential: async () => ({ txId: "tx-revoke" }),
    verifyCredential: async () => result,
    getHistory: async () => [],
    close: () => undefined,
  };
}

describe("trusted assessment binding", () => {
  it("binds score 73 to the learner, skill, and attempt commitment", async () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt()],
    });
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    assert.equal(selected.attempt.learnerUserId, LEARNER);
    assert.equal(selected.attempt.skillId, SKILL);
    assert.equal(selected.assessmentCommitment.attemptId, ATTEMPT);
    assert.equal(selected.assessmentCommitment.commitment, COMMITMENT);
    assert.equal(selected.assessmentCommitment.version, 1);
    assert.equal(selected.assessmentCommitment.scheme, TRUSTED_COMMITMENT_SCHEME);
    assert.equal(selected.assessmentCommitment.circuitId, TRUSTED_CIRCUIT_ID);

    const checked = await assertTrustedOpening({
      learnerId: LEARNER,
      attempt: selected.attempt,
      assessmentCommitment: selected.assessmentCommitment,
      opening: opening(),
    });
    assert.equal(checked.ok, true);

    const built = buildCredentialDocument({
      ...sampleInput,
      assessmentCommitment: selected.assessmentCommitment,
    });
    assert.deepEqual(built.document.credentialSubject.assessmentCommitment, {
      version: 1,
      scheme: TRUSTED_COMMITMENT_SCHEME,
      circuitId: TRUSTED_CIRCUIT_ID,
      attemptId: ATTEMPT,
      commitment: COMMITMENT,
    });
    assert.equal(built.canonicalJson.includes(COMMITMENT), true);
    assert.equal(built.canonicalJson.includes("42"), false);
    assert.equal(built.canonicalJson.includes("blinding"), false);
    assert.equal(built.canonicalJson.includes("answer"), false);
  });

  it("selects the latest completed attempt for the same skill", () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [
        attempt(),
        attempt({
          id: LATER_ATTEMPT,
          submittedAt: "2026-10-17T01:00:00.000Z",
          commitment: "99",
        }),
      ],
    });
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    assert.equal(selected.assessmentCommitment.attemptId, LATER_ATTEMPT);
    assert.equal(selected.assessmentCommitment.commitment, "99");
  });

  it("rejects an attempt owned by a different learner", () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt({ learnerUserId: OTHER_LEARNER })],
    });
    assert.equal(selected.ok, false);
    if (selected.ok) return;
    assert.equal(selected.status, 403);
    assert.match(selected.message, /authenticated learner/);
  });

  it("rejects an attempt for a different skill", () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt({ skillId: OTHER_SKILL })],
    });
    assert.equal(selected.ok, false);
    if (selected.ok) return;
    assert.equal(selected.status, 409);
    assert.match(selected.message, /this skill/);
  });

  it("rejects an incomplete assessment", () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt({ status: "in_progress", commitment: null })],
    });
    assert.equal(selected.ok, false);
    if (selected.ok) return;
    assert.match(selected.message, /not complete/);
  });

  it("rejects a completed attempt that has no trusted commitment", () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt({ commitment: null, commitmentScheme: null, commitmentCircuitId: null, commitmentVersion: null })],
    });
    assert.equal(selected.ok, false);
    if (selected.ok) return;
    assert.match(selected.message, /no trusted commitment/);
  });

  it("rejects a commitment that does not match the trusted opening", async () => {
    const selected = selectTrustedAssessmentAttempt({
      learnerId: LEARNER,
      skillId: SKILL,
      attempts: [attempt({ commitment: "99" })],
    });
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    const checked = await assertTrustedOpening({
      learnerId: LEARNER,
      attempt: selected.attempt,
      assessmentCommitment: selected.assessmentCommitment,
      opening: opening(),
    });
    assert.equal(checked.ok, false);
    if (checked.ok) return;
    assert.match(checked.message, /does not match the trusted opening/);
  });

  it("ignores a commitment supplied beside the skill id", () => {
    const parsed = issueCredentialSchema.parse({
      skillId: SKILL,
      commitment: "1",
      score: 100,
      blinding: "42",
    });
    assert.deepEqual(parsed, { skillId: SKILL });
  });

  it("covers the commitment with the signed document hash", () => {
    const keys = generateKeyPairSync("ed25519");
    const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const bound = buildCredentialDocument({
      ...sampleInput,
      assessmentCommitment: {
        version: 1,
        scheme: TRUSTED_COMMITMENT_SCHEME,
        circuitId: TRUSTED_CIRCUIT_ID,
        attemptId: ATTEMPT,
        commitment: COMMITMENT,
      },
    });
    const unbound = buildCredentialDocument(sampleInput);
    assert.notEqual(bound.sha256Hash, unbound.sha256Hash);
    assert.equal(bound.document.credentialSubject.assessmentCommitment?.commitment, COMMITMENT);
    const proof = signSha256Hash(bound.sha256Hash, privatePem);
    assert.equal(verifySha256Hash(bound.sha256Hash, proof, publicPem), true);
    assert.equal(verifySha256Hash(unbound.sha256Hash, proof, publicPem), false);
    assert.equal(unbound.document.credentialSubject.assessmentCommitment, undefined);
  });

  it("rejects a signed credential whose commitment was changed", async () => {
    const keys = generateKeyPairSync("ed25519");
    const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const bound = buildCredentialDocument({
      ...sampleInput,
      assessmentCommitment: {
        version: 1,
        scheme: TRUSTED_COMMITMENT_SCHEME,
        circuitId: TRUSTED_CIRCUIT_ID,
        attemptId: ATTEMPT,
        commitment: COMMITMENT,
      },
    });
    const tampered = structuredClone(bound.document);
    tampered.credentialSubject.assessmentCommitment!.commitment = "1";
    const snapshot: CredentialVerifySnapshot = {
      found: true,
      credentialId: "33333333-3333-4333-8333-333333333333",
      storedHash: bound.sha256Hash,
      storedDocument: tampered,
      proofValue: signSha256Hash(bound.sha256Hash, privatePem),
      revokedAt: null,
      anchorStatus: "anchored",
      anchorTxId: "tx-anchor",
      anchoredAt: "2026-10-17T01:00:00.000Z",
    };
    const result = await evaluateCredentialVerification(snapshot, {
      verifySignature: (hashHex, value) => verifySha256Hash(hashHex, value, publicPem),
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      now: () => new Date("2026-10-17T02:00:00.000Z"),
    });
    assert.equal(result.status, "tampered");
  });

  it("keeps a credential without a commitment verifiable", async () => {
    const keys = generateKeyPairSync("ed25519");
    const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const old = buildCredentialDocument(sampleInput);
    assert.equal(old.document.credentialSubject.assessmentCommitment, undefined);
    const snapshot: CredentialVerifySnapshot = {
      found: true,
      credentialId: "33333333-3333-4333-8333-333333333333",
      storedHash: old.sha256Hash,
      storedDocument: old.document,
      proofValue: signSha256Hash(old.sha256Hash, privatePem),
      revokedAt: null,
      anchorStatus: "anchored",
      anchorTxId: "tx-old",
      anchoredAt: "2026-01-15T01:00:00.000Z",
    };
    const result = await evaluateCredentialVerification(snapshot, {
      verifySignature: (hashHex, value) => verifySha256Hash(hashHex, value, publicPem),
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      now: () => new Date("2026-10-17T02:00:00.000Z"),
    });
    assert.equal(result.status, "verified");
    assert.equal(result.hash, old.sha256Hash);
  });

  it("gives Fabric the hash of the document that includes the commitment", async () => {
    const bound = buildCredentialDocument({
      ...sampleInput,
      assessmentCommitment: {
        version: 1,
        scheme: TRUSTED_COMMITMENT_SCHEME,
        circuitId: TRUSTED_CIRCUIT_ID,
        attemptId: ATTEMPT,
        commitment: COMMITMENT,
      },
    });
    const seen: string[] = [];
    const row: OutboxCredential = {
      id: "33333333-3333-4333-8333-333333333333",
      credentialHash: bound.sha256Hash,
      issuerDid: sampleInput.issuerDid,
      holderDid: sampleInput.holderDid,
      issuedAt: sampleInput.validFrom,
      anchorStatus: "pending",
      anchorAttempts: 0,
      updatedAt: "2026-10-17T00:00:00.000Z",
      createdAt: "2026-10-17T00:00:00.000Z",
    };
    const store: AnchorOutboxStore = {
      listCandidates: async () => [row],
      markAnchored: async () => undefined,
      markFailed: async () => undefined,
      getByIdOrUri: async () => row,
      resetForRetry: async () => row,
      countByStatus: async () => 0,
      listRevokeCandidates: async () => [],
      markRevokeSucceeded: async () => undefined,
      markRevokeFailed: async () => undefined,
    };
    const outcome = await processOneAnchor(row, {
      ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }, seen),
      store,
      batchSize: 1,
      maxAttempts: 3,
      backoffBaseMs: 1000,
    }, new Date("2026-10-17T00:00:00.000Z"), true);
    assert.equal(outcome, "succeeded");
    assert.deepEqual(seen, [bound.sha256Hash]);
    assert.notEqual(bound.sha256Hash, buildCredentialDocument(sampleInput).sha256Hash);
  });
});

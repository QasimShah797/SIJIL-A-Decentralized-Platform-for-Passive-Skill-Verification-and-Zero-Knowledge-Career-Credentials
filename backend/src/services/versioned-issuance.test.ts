import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { AppError } from "../utils/AppError";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { evaluateCredentialVerification } from "./credential-verify";
import { buildCredentialDocument } from "./credential-document.service";
import { createPendingVersion, recruiterMaySeeVersion, type CompetencyVersion } from "./competency-version";
import { acceptTrustedValidation, adoptExistingSignedCredential, bindIssuedVersion, MOODLE_VALIDATOR_MISSING, reviewerRequestIsNotIssuerAuthority, signCompetencyVersion } from "./versioned-issuance";
import type { LedgerPort } from "./ledger.types";

const LEARNER = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-11-17T12:00:00.000Z";
const V1 = "123e4567-e89b-42d3-a456-426614174000";

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    sign: (hash: string) => signSha256Hash(hash, privatePem),
    verify: (hash: string, proof: string) => verifySha256Hash(hash, proof, publicPem),
  };
}

function pending(source: "github" | "moodle" | "practical", reference: string): CompetencyVersion {
  return createPendingVersion({
    learnerUserId: LEARNER,
    skillName: "TypeScript",
    evidenceSource: source,
    evidenceReference: reference,
    evidenceSummary: "A later trusted record was submitted.",
    existing: [],
    now: NOW,
  });
}

const policy = {
  id: "323e4567-e89b-42d3-a456-426614174000",
  learnerUserId: LEARNER,
  zkpType: "score-threshold-v1",
  policyVersion: "assess-60-v1",
  threshold: 60,
  outcome: "MEETS_THRESHOLD",
  evidenceRef: "attempt:223e4567-e89b-42d3-a456-426614174000",
  evidenceScope: { attemptId: "223e4567-e89b-42d3-a456-426614174000", credentialId: "urn:uuid:sijil:old:typescript" },
};

const bound = { usedValidationReferences: [] as string[], usedEvidenceReferences: [] as string[], credentialSkillName: "TypeScript", previousAttemptIds: [] as string[] };

const disabledLedger: LedgerPort = {
  isEnabled: () => false,
  isReachable: async () => false,
  anchorCredential: async () => { throw new Error("disabled"); },
  verifyCredential: async () => { throw new Error("disabled"); },
  revokeCredential: async () => { throw new Error("disabled"); },
  getHistory: async () => [],
  close: () => undefined,
};

describe("version-aware credential issuance", () => {
  it("keeps version 1 unchanged and signs a different version 2", async () => {
    const pair = keys();
    const first = buildCredentialDocument({
      credentialUri: "urn:uuid:sijil:old:typescript",
      issuerDid: "did:web:issuer.cust.edu.pk",
      holderDid: "did:key:z6Mkholder",
      skill: "TypeScript",
      evidenceCount: 1,
      evidenceHashes: ["aa"],
      validFrom: "2026-01-01T00:00:00.000Z",
    });
    const firstProof = pair.sign(first.sha256Hash);
    const version = { ...pending("practical", policy.evidenceRef), versionNumber: 2, previousVersionId: "version-1" };
    const signed = signCompetencyVersion({
      version,
      validationReference: policy.id,
      previousCredentialId: V1,
      holderDid: "did:key:z6Mkholder",
      issuerDid: "did:web:issuer.cust.edu.pk",
      evidenceHash: version.evidenceFingerprint,
      signHash: pair.sign,
      verifyHash: pair.verify,
      now: NOW,
    });
    assert.notEqual(signed.id, V1);
    assert.notEqual(signed.credentialHash, first.sha256Hash);
    assert.equal(signed.document.credentialSubject.competencyVersion?.versionNumber, 2);
    assert.equal(signed.document.credentialSubject.competencyVersion?.previousCredentialId, V1);
    assert.equal(first.document.credentialSubject.competencyVersion, undefined);
    const verified = await evaluateCredentialVerification({
      found: true,
      credentialId: signed.id,
      storedHash: signed.credentialHash,
      storedDocument: signed.document,
      proofValue: String(signed.proof.proofValue),
      revokedAt: null,
      anchorStatus: "pending",
      anchorTxId: null,
      anchoredAt: null,
      holderDid: signed.holderDid,
      issuerDid: signed.issuerDid,
      storedEvidenceHashes: [version.evidenceFingerprint],
      liveEvidenceHashes: [version.evidenceFingerprint],
      evidenceHashMismatch: false,
    }, { verifySignature: pair.verify, ledger: disabledLedger, now: () => new Date(NOW) });
    assert.equal(verified.checks.signature, "valid");
    assert.equal(verified.status, "pending_anchor");
    const original = await evaluateCredentialVerification({
      found: true,
      credentialId: V1,
      storedHash: first.sha256Hash,
      storedDocument: first.document,
      proofValue: firstProof,
      revokedAt: null,
      anchorStatus: "pending",
      anchorTxId: null,
      anchoredAt: null,
      holderDid: "did:key:z6Mkholder",
      issuerDid: "did:web:issuer.cust.edu.pk",
      storedEvidenceHashes: ["aa"],
      liveEvidenceHashes: ["aa"],
      evidenceHashMismatch: false,
    }, { verifySignature: pair.verify, ledger: disabledLedger, now: () => new Date(NOW) });
    assert.equal(original.checks.signature, "valid");
    assert.equal(original.hash, first.sha256Hash);
  });

  it("rejects a learner, unvalidated evidence, Moodle, and a second signature for the same version", () => {
    const version = pending("practical", policy.evidenceRef);
    assert.throws(() => acceptTrustedValidation({ actor: "learner", version, policy, ...bound }), (err: unknown) => err instanceof AppError && err.statusCode === 403);
    assert.throws(() => acceptTrustedValidation({ actor: "issuer", version, policy: { ...policy, outcome: "BELOW_THRESHOLD" }, ...bound }), /not passed/);
    assert.throws(() => acceptTrustedValidation({ actor: "issuer", version: pending("moodle", "course:1"), policy: null, ...bound }), new RegExp(MOODLE_VALIDATOR_MISSING));
    assert.throws(() => reviewerRequestIsNotIssuerAuthority({ learnerUserId: LEARNER, outcome: "MEETS_THRESHOLD" }), /cannot supply/);
    const reference = acceptTrustedValidation({ actor: "issuer", version, policy, ...bound });
    const issued = bindIssuedVersion(version, "423e4567-e89b-42d3-a456-426614174000", reference);
    assert.throws(() => bindIssuedVersion(issued, V1, reference), /different credential/);
    assert.equal(version.credentialId, null);
    assert.equal(issued.credentialId, "423e4567-e89b-42d3-a456-426614174000");
  });

  it("rejects a reused validation event, a mismatched competency, and a second signature", () => {
    const version = pending("practical", policy.evidenceRef);
    assert.throws(() => acceptTrustedValidation({ actor: "issuer", version, policy, ...bound, usedValidationReferences: [policy.id] }), /already used/);
    assert.throws(() => acceptTrustedValidation({ actor: "issuer", version, policy, ...bound, previousAttemptIds: ["223e4567-e89b-42d3-a456-426614174000"] }), /cannot reuse/);
    assert.throws(() => acceptTrustedValidation({ actor: "issuer", version, policy, ...bound, credentialSkillName: "Java" }), /not bound to this competency/);
    const signed = adoptExistingSignedCredential(version, { id: "423e4567-e89b-42d3-a456-426614174000", validationReference: policy.id });
    const again = adoptExistingSignedCredential(signed!, { id: "423e4567-e89b-42d3-a456-426614174000", validationReference: policy.id });
    assert.equal(again?.credentialId, signed?.credentialId);
    assert.throws(() => adoptExistingSignedCredential(signed!, { id: V1, validationReference: policy.id }), /different credential/);
  });

  it("rejects a changed signed claim", async () => {
    const pair = keys();
    const version = pending("practical", policy.evidenceRef);
    const signed = signCompetencyVersion({
      version,
      validationReference: policy.id,
      previousCredentialId: V1,
      holderDid: "did:key:z6Mkholder",
      issuerDid: "did:web:issuer.cust.edu.pk",
      evidenceHash: version.evidenceFingerprint,
      signHash: pair.sign,
      verifyHash: pair.verify,
      now: NOW,
    });
    const tampered = { ...signed.document, credentialSubject: { ...signed.document.credentialSubject, competencyVersion: { ...signed.document.credentialSubject.competencyVersion!, versionNumber: 9 } } };
    const result = await evaluateCredentialVerification({
      found: true,
      credentialId: signed.id,
      storedHash: signed.credentialHash,
      storedDocument: tampered,
      proofValue: String(signed.proof.proofValue),
      revokedAt: null,
      anchorStatus: "pending",
      anchorTxId: null,
      anchoredAt: null,
      holderDid: signed.holderDid,
      issuerDid: signed.issuerDid,
    }, { verifySignature: pair.verify, ledger: disabledLedger, now: () => new Date(NOW) });
    assert.equal(result.status, "tampered");
    assert.notEqual(result.checks.anchor, "match");
  });

  it("does not reveal version 2 from a version 1 share", () => {
    const first = pending("practical", policy.evidenceRef);
    const share = { credentialId: V1, versionId: first.id };
    const second = { ...first, id: "523e4567-e89b-42d3-a456-426614174000", versionNumber: 2, credentialId: "623e4567-e89b-42d3-a456-426614174000" };
    assert.equal(recruiterMaySeeVersion(first, [share]), true);
    assert.equal(recruiterMaySeeVersion(second, [share]), false);
  });
});

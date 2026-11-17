/**
 * Signs a new credential version with the existing issuer key.
 * A learner note is not validation. Moodle has no trusted pass/fail record.
 */
import { randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";
import { generateCredentialUri } from "../utils/generateHash";
import { buildCredentialDocument, type CredentialDocument } from "./credential-document.service";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  GITHUB_POLICY_THRESHOLD,
  GITHUB_POLICY_VERSION,
  GITHUB_ZKP_TYPE,
} from "./zkp-policy";
import {
  CREDENTIAL_CRYPTOSUITE,
  CREDENTIAL_PROOF_TYPE,
  issuerVerificationMethod,
} from "./signing.service";
import { rejectCredentialReuse, rejectLearnerValidation, type CompetencyVersion } from "./competency-version";

export const MOODLE_VALIDATOR_MISSING =
  "Moodle evidence cannot authorize a credential version. SIJIL has no trusted Moodle pass/fail validator.";

export type TrustedPolicyRecord = {
  id: string;
  learnerUserId: string;
  zkpType: string;
  policyVersion: string;
  threshold: number;
  outcome: string;
  evidenceRef: string;
  evidenceScope?: Record<string, unknown>;
};

export function reviewerRequestIsNotIssuerAuthority(body: Record<string, unknown>): void {
  const extra = Object.keys(body).filter((key) => key !== "learnerUserId");
  if (extra.length > 0) {
    throw new AppError("A reviewer cannot supply a validation result or a signature. The issuer key signs only a stored policy record.", 400);
  }
}

export function acceptTrustedValidation(input: {
  actor: "learner" | "issuer";
  version: CompetencyVersion;
  policy: TrustedPolicyRecord | null;
  usedValidationReferences: string[];
  usedEvidenceReferences: string[];
  credentialSkillName?: string | null;
  linkedCompetencyName?: string | null;
  previousAttemptIds?: string[];
}): string {
  if (input.actor !== "issuer") rejectLearnerValidation();
  if (input.version.status === "issued") throw new AppError("This version is already issued.", 409);
  if (input.version.evidenceSource === "moodle") throw new AppError(MOODLE_VALIDATOR_MISSING, 409);
  if (input.usedEvidenceReferences.includes(input.version.evidenceReference)) {
    throw new AppError("This evidence record is already used for another version.", 409);
  }
  const policy = input.policy;
  if (!policy || policy.learnerUserId !== input.version.learnerUserId || policy.evidenceRef !== input.version.evidenceReference) {
    throw new AppError("No trusted validation record matches this evidence.", 409);
  }
  if (policy.outcome !== "MEETS_THRESHOLD") {
    throw new AppError("This evidence has not passed trusted validation.", 409);
  }
  const expected = input.version.evidenceSource === "practical"
    ? { type: ASSESSMENT_ZKP_TYPE, version: ASSESSMENT_POLICY_VERSION, threshold: ASSESSMENT_POLICY_THRESHOLD }
    : { type: GITHUB_ZKP_TYPE, version: GITHUB_POLICY_VERSION, threshold: GITHUB_POLICY_THRESHOLD };
  if (policy.zkpType !== expected.type || policy.policyVersion !== expected.version || policy.threshold !== expected.threshold) {
    throw new AppError("The validation record does not match the trusted policy.", 409);
  }
  if (input.usedValidationReferences.includes(policy.id)) {
    throw new AppError("That validation record was already used.", 409);
  }
  const scope = policy.evidenceScope ?? {};
  if (input.version.evidenceSource === "practical") {
    const attemptId = input.version.evidenceReference.startsWith("attempt:") ? input.version.evidenceReference.slice("attempt:".length) : "";
    if (!attemptId || scope.attemptId !== attemptId) {
      throw new AppError("The validation event is not bound to this evidence.", 409);
    }
    if ((input.previousAttemptIds ?? []).includes(attemptId)) {
      throw new AppError("Version 2 cannot reuse the validation event already bound to an earlier credential.", 409);
    }
    if (!input.credentialSkillName || input.credentialSkillName.trim().toLowerCase() !== input.version.skillName.trim().toLowerCase()) {
      throw new AppError("The validation event is not bound to this competency.", 409);
    }
  }
  if (input.version.evidenceSource === "github") {
    const repository = typeof scope.repositoryFullName === "string" ? scope.repositoryFullName.trim().toLowerCase() : "";
    const referenced = input.version.evidenceReference.replace(/^repo:/i, "").trim().toLowerCase();
    if (!repository || repository !== referenced) {
      throw new AppError("The validation event is not bound to this evidence.", 409);
    }
    if (!input.linkedCompetencyName || input.linkedCompetencyName.trim().toLowerCase() !== input.version.skillName.trim().toLowerCase()) {
      throw new AppError("The validation event is not bound to this competency.", 409);
    }
  }
  return policy.id;
}

export function adoptExistingSignedCredential(
  version: CompetencyVersion,
  stored: { id: string; validationReference: string } | null,
): CompetencyVersion | null {
  if (!stored) return null;
  if (!stored.validationReference) throw new AppError("The stored credential is missing its validation reference.", 409);
  return bindIssuedVersion(version, stored.id, stored.validationReference);
}

export type SignedVersionCredential = {
  id: string;
  credentialUri: string;
  document: CredentialDocument;
  credentialHash: string;
  proof: Record<string, unknown>;
  issuerDid: string;
  holderDid: string;
  validFrom: string;
};

export function signCompetencyVersion(input: {
  version: CompetencyVersion;
  validationReference: string;
  previousCredentialId: string | null;
  holderDid: string;
  issuerDid: string;
  evidenceHash: string;
  signHash: (hashHex: string) => string;
  verifyHash: (hashHex: string, proofValue: string) => boolean;
  now: string;
  credentialId?: string;
}): SignedVersionCredential {
  rejectCredentialReuse(
    input.previousCredentialId ? [{ credentialId: input.previousCredentialId } as CompetencyVersion] : [],
    input.credentialId ?? "",
  );
  const credentialUri = `${generateCredentialUri(input.version.learnerUserId, input.version.skillName)}:v${input.version.versionNumber}`;
  const { document, sha256Hash } = buildCredentialDocument({
    credentialUri,
    issuerDid: input.issuerDid,
    holderDid: input.holderDid,
    skill: input.version.skillName,
    evidenceCount: 1,
    evidenceHashes: [input.evidenceHash],
    validFrom: input.now,
    competencyVersion: {
      competencyKey: input.version.competencyKey,
      versionNumber: input.version.versionNumber,
      previousCredentialId: input.previousCredentialId,
      evidenceFingerprint: input.version.evidenceFingerprint,
      validationReference: input.validationReference,
    },
  });
  if (document.credentialSubject.id !== input.holderDid) {
    throw new AppError("credentialSubject.id must match the proven holder DID", 500);
  }
  const proofValue = input.signHash(sha256Hash);
  if (!input.verifyHash(sha256Hash, proofValue)) {
    throw new AppError("The new credential signature did not verify.", 500);
  }
  return {
    id: input.credentialId ?? randomUUID(),
    credentialUri,
    document,
    credentialHash: sha256Hash,
    proof: {
      type: CREDENTIAL_PROOF_TYPE,
      cryptosuite: CREDENTIAL_CRYPTOSUITE,
      created: input.now,
      verificationMethod: issuerVerificationMethod(input.issuerDid),
      proofValue,
      proofPurpose: "assertionMethod",
    },
    issuerDid: input.issuerDid,
    holderDid: input.holderDid,
    validFrom: input.now,
  };
}

export function validationReferenceFromDocument(document: unknown): string | null {
  if (!document || typeof document !== "object") return null;
  const claim = (document as { credentialSubject?: { competencyVersion?: { validationReference?: unknown } } }).credentialSubject?.competencyVersion;
  return claim && typeof claim.validationReference === "string" ? claim.validationReference : null;
}

export function bindIssuedVersion(version: CompetencyVersion, credentialId: string, validationReference: string): CompetencyVersion {
  if (version.credentialId && version.credentialId !== credentialId) {
    throw new AppError("This version is already bound to a different credential.", 409);
  }
  return {
    ...version,
    status: "issued",
    credentialId,
    validationReference,
  };
}

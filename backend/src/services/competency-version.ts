/**
 * Competency versions stay pending until an authorized issuer signs a new credential.
 * A learner cannot promote evidence, reuse an old credential, or confirm an anchor.
 */
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";

export const VERSION_STATUSES = ["pending_evidence", "issued"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export type AnchorStatus = "not_requested" | "unavailable" | "confirmed" | "failed";
export type EvidenceSource = "github" | "moodle" | "practical";

export type CompetencyVersion = {
  id: string;
  learnerUserId: string;
  competencyKey: string;
  skillName: string;
  versionNumber: number;
  previousVersionId: string | null;
  credentialId: string | null;
  status: VersionStatus;
  evidenceSource: EvidenceSource;
  evidenceSummary: string;
  evidenceReference: string;
  evidenceFingerprint: string;
  validationReference: string | null;
  anchorStatus: AnchorStatus;
  anchorTxId: string | null;
  createdAt: string;
};

export const SIGNED_VERSION_UNAVAILABLE =
  "A new signed credential cannot be issued yet. The current issuer returns the existing credential for this skill and does not sign a separate version.";

export function competencyKey(skillName: string): string {
  const key = skillName.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.length < 2 || key.length > 80) throw new AppError("Enter the competency name.", 400);
  return key;
}

export function evidenceFingerprint(key: string, source: EvidenceSource, summary: string): string {
  return createHash("sha256").update(`${key}\n${source}\n${summary.trim()}`).digest("hex");
}

export function createPendingVersion(input: {
  learnerUserId: string;
  skillName: string;
  evidenceSource: EvidenceSource;
  evidenceReference: string;
  evidenceSummary: string;
  existing: CompetencyVersion[];
  now: string;
}): CompetencyVersion {
  const summary = input.evidenceSummary.trim();
  if (summary.length < 8 || summary.length > 500) {
    throw new AppError("Describe the new evidence in a short note. This does not issue a credential.", 400);
  }
  const key = competencyKey(input.skillName);
  const reference = input.evidenceReference.trim();
  if (reference.length < 3 || reference.length > 200) throw new AppError("Name the trusted evidence record.", 400);
  const fingerprint = evidenceFingerprint(key, input.evidenceSource, `${reference}\n${summary}`);
  const mine = input.existing.filter((row) => row.learnerUserId === input.learnerUserId && row.competencyKey === key);
  if (mine.some((row) => row.evidenceReference === reference || row.evidenceFingerprint === fingerprint)) {
    throw new AppError("This evidence is already recorded for the competency.", 409);
  }
  if (mine.some((row) => row.status !== "issued")) {
    throw new AppError("A version is already open for this competency.", 409);
  }
  const previous = mine.filter((row) => row.status === "issued").sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
  const versionNumber = (previous?.versionNumber ?? 0) + 1;
  if (mine.some((row) => row.versionNumber === versionNumber)) {
    throw new AppError("That version number is already reserved.", 409);
  }
  return {
    id: randomUUID(),
    learnerUserId: input.learnerUserId,
    competencyKey: key,
    skillName: input.skillName.trim(),
    versionNumber,
    previousVersionId: previous?.id ?? null,
    credentialId: null,
    status: "pending_evidence",
    evidenceSource: input.evidenceSource,
    evidenceReference: reference,
    evidenceSummary: summary,
    evidenceFingerprint: fingerprint,
    validationReference: null,
    anchorStatus: "not_requested",
    anchorTxId: null,
    createdAt: input.now,
  };
}

export function rejectLearnerValidation(): never {
  throw new AppError("Only trusted validation can advance this evidence. Submitting it does not verify the competency.", 403);
}

export function rejectCredentialReuse(existing: CompetencyVersion[], credentialId: string): void {
  if (existing.some((row) => row.credentialId === credentialId)) {
    throw new AppError("An existing credential cannot be reused as a new version.", 409);
  }
}

export function requestSignedVersion(input: {
  actor: "learner" | "issuer";
  version: CompetencyVersion;
  existing: CompetencyVersion[];
  credentialId?: string | null;
}): never {
  if (input.version.status === "issued") {
    throw new AppError("This version is already issued.", 409);
  }
  if (input.actor !== "issuer") rejectLearnerValidation();
  if (input.credentialId) rejectCredentialReuse(input.existing, input.credentialId);
  throw new AppError(SIGNED_VERSION_UNAVAILABLE, 409);
}

export function applyAnchorResult(
  version: CompetencyVersion,
  result: { available: false } | { available: true; txId: string } | { available: true; failed: true },
): CompetencyVersion {
  if (version.status !== "issued" || !version.credentialId || !version.validationReference) {
    throw new AppError("Only a newly signed credential version can be anchored.", 409);
  }
  if (!result.available) return { ...version, anchorStatus: "unavailable", anchorTxId: null };
  if ("failed" in result) return { ...version, anchorStatus: "failed", anchorTxId: null };
  if (!result.txId.trim()) throw new AppError("The ledger did not return a transaction id.", 502);
  return { ...version, anchorStatus: "confirmed", anchorTxId: result.txId.trim() };
}

export function recruiterMaySeeVersion(version: CompetencyVersion, disclosedPayloads: unknown[]): boolean {
  return disclosedPayloads.some((payload) => {
    const text = JSON.stringify(payload ?? "");
    return text.includes(version.id) || (version.credentialId !== null && text.includes(version.credentialId));
  });
}

export function publicRecruiterVersion(version: CompetencyVersion) {
  return {
    id: version.id,
    skillName: version.skillName,
    versionNumber: version.versionNumber,
    status: version.status,
    anchorStatus: version.anchorStatus,
    createdAt: version.createdAt,
    credentialId: version.credentialId,
    hasCredential: Boolean(version.credentialId),
  };
}

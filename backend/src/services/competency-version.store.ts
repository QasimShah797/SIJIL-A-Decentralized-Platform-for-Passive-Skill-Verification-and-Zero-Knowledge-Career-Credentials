import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError, isUniqueViolation } from "../utils/supabase-errors";
import { getEvaluateLedgerService } from "./ledger.factory";
import { ssiService } from "./ssi.service";
import { createSupabaseZkpPolicyStore } from "./zkp-policy-store";
import { ASSESSMENT_POLICY_VERSION, ASSESSMENT_ZKP_TYPE, GITHUB_POLICY_VERSION, GITHUB_ZKP_TYPE } from "./zkp-policy";
import { CREDENTIAL_VERIFICATION } from "../constants/status";
import { acceptTrustedValidation, adoptExistingSignedCredential, bindIssuedVersion, signCompetencyVersion, validationReferenceFromDocument } from "./versioned-issuance";
import { signCredentialHash, verifyCredentialHash } from "./signing.service";
import {
  applyAnchorResult,
  createPendingVersion,
  requestSignedVersion,
  type CompetencyVersion,
  type EvidenceSource,
} from "./competency-version";

type Row = Record<string, unknown>;

function map(row: Row): CompetencyVersion {
  return {
    id: String(row.id),
    learnerUserId: String(row.learner_user_id),
    competencyKey: String(row.competency_key),
    skillName: String(row.skill_name),
    versionNumber: Number(row.version_number),
    previousVersionId: typeof row.previous_version_id === "string" ? row.previous_version_id : null,
    credentialId: typeof row.credential_id === "string" ? row.credential_id : null,
    status: row.status === "issued" ? "issued" : "pending_evidence",
    evidenceSource: row.evidence_source === "moodle" || row.evidence_source === "practical" ? row.evidence_source : "github",
    evidenceReference: String(row.evidence_reference ?? ""),
    evidenceSummary: String(row.evidence_summary ?? ""),
    evidenceFingerprint: String(row.evidence_fingerprint ?? ""),
    validationReference: typeof row.validation_reference === "string" ? row.validation_reference : null,
    anchorStatus: row.anchor_status as CompetencyVersion["anchorStatus"],
    anchorTxId: typeof row.anchor_tx_id === "string" ? row.anchor_tx_id : null,
    createdAt: String(row.created_at),
  };
}

function db() {
  return getServiceSupabase();
}

export async function competencyVersionsAvailable(): Promise<boolean> {
  const { error } = await db().from("competency_credential_versions").select("id").limit(1);
  return !error;
}

export async function listLearnerVersions(learnerUserId: string): Promise<CompetencyVersion[]> {
  const { data, error } = await db().from("competency_credential_versions").select("*").eq("learner_user_id", learnerUserId).order("version_number");
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => map(row as Row));
}

async function save(row: CompetencyVersion): Promise<CompetencyVersion> {
  const { data, error } = await db().from("competency_credential_versions").upsert({
    id: row.id,
    learner_user_id: row.learnerUserId,
    competency_key: row.competencyKey,
    skill_name: row.skillName,
    version_number: row.versionNumber,
    previous_version_id: row.previousVersionId,
    credential_id: row.credentialId,
    status: row.status,
    evidence_source: row.evidenceSource,
    evidence_reference: row.evidenceReference,
    evidence_summary: row.evidenceSummary,
    evidence_fingerprint: row.evidenceFingerprint,
    validation_reference: row.validationReference,
    anchor_status: row.anchorStatus,
    anchor_tx_id: row.anchorTxId,
    updated_at: new Date().toISOString(),
    created_at: row.createdAt,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("version was not saved");
  return map(data as Row);
}

export async function recordPendingImprovement(learnerUserId: string, skillName: string, evidenceSource: EvidenceSource, evidenceReference: string, evidenceSummary: string): Promise<CompetencyVersion> {
  const existing = await listLearnerVersions(learnerUserId);
  return save(createPendingVersion({ learnerUserId, skillName, evidenceSource, evidenceReference, evidenceSummary, existing, now: new Date().toISOString() }));
}

async function credentialForVersion(versionId: string): Promise<{ id: string; validationReference: string } | null> {
  const { data, error } = await db().from("credentials").select("id, credential_document").eq("competency_version_id", versionId).maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) throw new AppError("The versioned credential column is not applied yet.", 503);
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as { id?: string; credential_document?: unknown };
  const validationReference = validationReferenceFromDocument(row.credential_document);
  if (!row.id || !validationReference) throw new Error("stored version credential is incomplete");
  return { id: row.id, validationReference };
}

async function validationBinding(learnerUserId: string, version: CompetencyVersion, scope: Record<string, unknown> | null): Promise<{
  credentialSkillName: string | null;
  linkedCompetencyName: string | null;
  previousAttemptIds: string[];
}> {
  const previousAttemptIds: string[] = [];
  const { data: prior } = await db().from("credentials").select("credential_document, skill_name, user_id").eq("user_id", learnerUserId);
  for (const row of (prior ?? []) as Array<{ credential_document?: unknown; skill_name?: string; user_id?: string }>) {
    if (row.user_id !== learnerUserId) continue;
    if ((row.skill_name ?? "").trim().toLowerCase() !== version.skillName.trim().toLowerCase()) continue;
    const attemptId = (row.credential_document as { credentialSubject?: { assessmentCommitment?: { attemptId?: string } } } | null)?.credentialSubject?.assessmentCommitment?.attemptId;
    if (typeof attemptId === "string") previousAttemptIds.push(attemptId);
  }
  let credentialSkillName: string | null = null;
  const credentialUri = typeof scope?.credentialId === "string" ? scope.credentialId : "";
  if (credentialUri) {
    const { data } = await db().from("credentials").select("skill_name, user_id").eq("credential_uri", credentialUri).maybeSingle();
    const row = data as { skill_name?: string; user_id?: string } | null;
    if (row?.user_id === learnerUserId && typeof row.skill_name === "string") credentialSkillName = row.skill_name;
  }
  let linkedCompetencyName: string | null = null;
  const repository = typeof scope?.repositoryFullName === "string" ? scope.repositoryFullName : "";
  if (repository) {
    const { data: repos, error: repoError } = await db().from("github_repos").select("linked_skill_id, user_id, full_name").eq("user_id", learnerUserId);
    if (repoError && !isMissingRelationError(repoError)) throw repoError;
    const repo = ((repos ?? []) as Array<{ linked_skill_id?: string | null; user_id?: string; full_name?: string }>)
      .find((row) => row.user_id === learnerUserId && (row.full_name ?? "").toLowerCase() === repository.toLowerCase());
    if (repo?.linked_skill_id) {
      const { data: skill } = await db().from("declared_skills").select("name, user_id").eq("id", repo.linked_skill_id).maybeSingle();
      const skillRow = skill as { name?: string; user_id?: string } | null;
      if (skillRow?.user_id === learnerUserId && typeof skillRow.name === "string") linkedCompetencyName = skillRow.name;
    }
  }
  return { credentialSkillName, linkedCompetencyName, previousAttemptIds };
}

function issuerDidFromInstitution(institution: string): string {
  return `did:web:issuer.${institution.toLowerCase().replace(/\s+/g, "")}.edu.pk`;
}

export async function issueValidatedCompetencyVersion(learnerUserId: string, versionId: string): Promise<CompetencyVersion> {
  const existing = await listLearnerVersions(learnerUserId);
  const version = existing.find((row) => row.id === versionId);
  if (!version || version.learnerUserId !== learnerUserId) throw new Error("not found");
  if (version.credentialId && version.status === "issued") return version;
  const policyKind = version.evidenceSource === "practical"
    ? { type: ASSESSMENT_ZKP_TYPE, version: ASSESSMENT_POLICY_VERSION }
    : version.evidenceSource === "github"
      ? { type: GITHUB_ZKP_TYPE, version: GITHUB_POLICY_VERSION }
      : null;
  const policy = policyKind
    ? await createSupabaseZkpPolicyStore().getByEvidence(learnerUserId, policyKind.type, policyKind.version, version.evidenceReference)
    : null;
  const storedCredential = await credentialForVersion(version.id);
  const reused = adoptExistingSignedCredential(version, storedCredential);
  if (reused) {
    const ledger = getEvaluateLedgerService();
    return save(ledger.isEnabled() ? reused : applyAnchorResult(reused, { available: false }));
  }
  const binding = await validationBinding(learnerUserId, version, policy?.evidenceScope ?? null);
  const validationReference = acceptTrustedValidation({
    actor: "issuer",
    version,
    policy,
    usedValidationReferences: existing.map((row) => row.validationReference).filter((value): value is string => Boolean(value)),
    usedEvidenceReferences: existing.filter((row) => row.id !== version.id).map((row) => row.evidenceReference),
    credentialSkillName: binding.credentialSkillName,
    linkedCompetencyName: binding.linkedCompetencyName,
    previousAttemptIds: binding.previousAttemptIds,
  });
  const previous = existing.find((row) => row.id === version.previousVersionId);
  const holderDid = await ssiService.requireProvenHolderDid(learnerUserId);
  const { data: profile } = await db().from("learner_profiles").select("institution_name").eq("user_id", learnerUserId).maybeSingle();
  const issuerDid = issuerDidFromInstitution(String((profile as { institution_name?: string } | null)?.institution_name || "CUST"));
  const signed = signCompetencyVersion({
    version,
    validationReference,
    previousCredentialId: previous?.credentialId ?? null,
    holderDid,
    issuerDid,
    evidenceHash: version.evidenceFingerprint,
    signHash: signCredentialHash,
    verifyHash: verifyCredentialHash,
    now: new Date().toISOString(),
  });
  const { error: insertError } = await db().from("credentials").insert({
    id: signed.id,
    user_id: learnerUserId,
    credential_uri: signed.credentialUri,
    name: `${version.skillName} Competency Credential v${version.versionNumber}`,
    credential_types: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer_name: String((profile as { institution_name?: string } | null)?.institution_name || "CUST"),
    issuer_did: signed.issuerDid,
    holder_did: signed.holderDid,
    valid_from: signed.validFrom,
    verification_status: CREDENTIAL_VERIFICATION.VERIFIED,
    attestation_status: "Approved",
    supporting_records: 1,
    skill_name: version.skillName,
    proof: signed.proof,
    credential_document: signed.document,
    credential_hash: signed.credentialHash,
    anchor_status: "pending",
    competency_version_id: version.id,
  });
  if (insertError) {
    if (!isUniqueViolation(insertError)) throw insertError;
    const winner = await credentialForVersion(version.id);
    const adopted = adoptExistingSignedCredential(version, winner);
    if (!adopted) throw insertError;
    const ledger = getEvaluateLedgerService();
    return save(ledger.isEnabled() ? adopted : applyAnchorResult(adopted, { available: false }));
  }
  const issued = bindIssuedVersion(version, signed.id, validationReference);
  const ledger = getEvaluateLedgerService();
  const anchored = ledger.isEnabled()
    ? issued
    : applyAnchorResult(issued, { available: false });
  return save(anchored);
}

export function refuseLearnerIssuance(learnerUserId: string, version: CompetencyVersion, existing: CompetencyVersion[], credentialId?: string): never {
  if (version.learnerUserId !== learnerUserId) throw new Error("not found");
  requestSignedVersion({ actor: "learner", version, existing, credentialId });
}

export async function anchorIssuedVersion(learnerUserId: string, versionId: string): Promise<CompetencyVersion> {
  const existing = await listLearnerVersions(learnerUserId);
  const current = existing.find((row) => row.id === versionId);
  if (!current?.credentialId) throw new Error("not found");
  const ledger = getEvaluateLedgerService();
  const { data } = await db().from("credentials").select("credential_hash, issuer_did, holder_did, created_at, user_id").eq("id", current.credentialId).maybeSingle();
  const credential = data as { credential_hash?: string | null; issuer_did?: string | null; holder_did?: string | null; created_at?: string; user_id?: string } | null;
  if (!ledger.isEnabled() || !credential || credential.user_id !== learnerUserId || !credential.credential_hash || !credential.issuer_did || !credential.holder_did) {
    return save(applyAnchorResult(current, { available: false }));
  }
  try {
    const result = await ledger.anchorCredential({
      credentialId: current.credentialId,
      hash: credential.credential_hash,
      issuerDid: credential.issuer_did,
      holderDid: credential.holder_did,
      issuedAt: credential.created_at ?? current.createdAt,
    });
    return save(applyAnchorResult(current, { available: true, txId: result.txId }));
  } catch {
    return save(applyAnchorResult(current, { available: true, failed: true }));
  }
}

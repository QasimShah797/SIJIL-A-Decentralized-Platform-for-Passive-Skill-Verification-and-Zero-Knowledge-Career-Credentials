/**
 * Share-scope filtering and per-skill blockchain trust labels.
 * A skill is blockchain verified only with an issued credential whose
 * public verify status is `verified` (Ed25519 + active Fabric anchor).
 */

export type WalletShareScope = "all" | "selected" | "issued";

export interface SkillTrustAnnotation {
  issued: boolean;
  credentialId: string | null;
  ledgerStatus: string;
  ledgerDetail: string | null;
  blockchainVerified: boolean;
  trustLabel: string;
}

export function isBlockchainVerified(status: string | null | undefined, detail?: string | null): boolean {
  return status === "verified" && detail !== "legacy_unverified_evidence";
}

export function skillTrustLabel(input: {
  issued: boolean;
  ledgerStatus: string;
  detail?: string | null;
}): string {
  if (!input.issued) return "Not verified / No issued credential";
  if (isBlockchainVerified(input.ledgerStatus, input.detail)) return "Blockchain verified";
  if (input.ledgerStatus === "pending_anchor") return "Issued · pending blockchain anchor";
  if (input.ledgerStatus === "ledger_unavailable") return "Issued · ledger unavailable";
  if (input.ledgerStatus === "revoked") return "Revoked";
  if (input.ledgerStatus === "tampered") return "Tampered";
  if (input.ledgerStatus === "evidence_unavailable") return "Issued · evidence unavailable";
  if (input.ledgerStatus === "not_found") return "Not verified / No issued credential";
  return "Issued · not blockchain verified";
}

export function annotateSkillTrust(input: {
  issued: boolean;
  credentialId?: string | null;
  ledgerStatus: string;
  detail?: string | null;
}): SkillTrustAnnotation {
  const ledgerStatus = input.issued ? input.ledgerStatus : "not_found";
  const ledgerDetail = input.detail ?? null;
  return {
    issued: input.issued,
    credentialId: input.issued ? input.credentialId ?? null : null,
    ledgerStatus,
    ledgerDetail,
    blockchainVerified: input.issued && isBlockchainVerified(ledgerStatus, ledgerDetail),
    trustLabel: skillTrustLabel({
      issued: input.issued,
      ledgerStatus,
      detail: ledgerDetail,
    }),
  };
}

export function siblingIdsForShareScope(
  scope: WalletShareScope,
  primaryId: string,
  allIds: string[],
  issuedIds: Set<string>,
): string[] {
  if (scope === "selected") return [];
  const pool = scope === "issued" ? allIds.filter((id) => issuedIds.has(id)) : allIds;
  return pool.filter((id) => id !== primaryId);
}

export function canCreateIssuedOnlyShare(primaryId: string, issuedIds: Set<string>): boolean {
  return issuedIds.has(primaryId);
}

export function resumeImpliesAllSkillsVerified(skills: Array<{ blockchainVerified?: boolean }>): boolean {
  if (skills.length === 0) return false;
  return skills.every((skill) => skill.blockchainVerified === true);
}

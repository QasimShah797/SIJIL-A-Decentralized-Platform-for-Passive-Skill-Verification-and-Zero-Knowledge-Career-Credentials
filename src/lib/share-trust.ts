/**
 * Per-skill blockchain trust labels for public recruiter views.
 * Blockchain verified requires an issued credential whose ledger status is `verified`.
 */

export type WalletShareScope = "all" | "selected" | "issued";

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

export function skillTrustFromRow(row: Record<string, unknown>): {
  issued: boolean;
  credentialId: string | null;
  ledgerStatus: string;
  ledgerDetail: string | null;
  blockchainVerified: boolean;
  trustLabel: string;
} {
  const issued = row.issued === true;
  const ledgerStatus = typeof row.ledgerStatus === "string"
    ? row.ledgerStatus
    : issued ? "ledger_unavailable" : "not_found";
  const ledgerDetail = typeof row.ledgerDetail === "string" ? row.ledgerDetail : null;
  const blockchainVerified = issued && isBlockchainVerified(ledgerStatus, ledgerDetail);
  const trustLabel = typeof row.trustLabel === "string" && row.trustLabel.trim()
    ? row.trustLabel
    : skillTrustLabel({ issued, ledgerStatus, detail: ledgerDetail });
  return {
    issued,
    credentialId: typeof row.credentialId === "string" ? row.credentialId : null,
    ledgerStatus,
    ledgerDetail,
    blockchainVerified,
    trustLabel,
  };
}

export function resumeImpliesAllSkillsVerified(skills: Array<{ blockchainVerified?: boolean }>): boolean {
  if (skills.length === 0) return false;
  return skills.every((skill) => skill.blockchainVerified === true);
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

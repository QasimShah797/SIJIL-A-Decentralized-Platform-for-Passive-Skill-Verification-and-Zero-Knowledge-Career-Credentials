import type { StatusVariant } from "@/components/sijil/StatusBadge";

export type LedgerVerifyStatus =
  | "verified"
  | "tampered"
  | "revoked"
  | "pending_anchor"
  | "ledger_unavailable"
  | "evidence_unavailable"
  | "not_found";

export type LedgerVerifyDetail = "legacy_unverified_evidence";

export type LedgerDisplayLabel = LedgerVerifyStatus | LedgerVerifyDetail;

export type WalletAnchorStatus = "pending" | "anchored" | "failed";

export interface LedgerStatusBadge {
  variant: StatusVariant;
  label: LedgerDisplayLabel;
}

export interface WalletAnchorBadge {
  variant: StatusVariant;
  label: WalletAnchorStatus;
}

const LEDGER_STATUS_BADGE: Record<LedgerVerifyStatus, LedgerStatusBadge> = {
  verified: { variant: "verified", label: "verified" },
  tampered: { variant: "destructive", label: "tampered" },
  revoked: { variant: "destructive", label: "revoked" },
  pending_anchor: { variant: "pending", label: "pending_anchor" },
  ledger_unavailable: { variant: "warning", label: "ledger_unavailable" },
  evidence_unavailable: { variant: "warning", label: "evidence_unavailable" },
  not_found: { variant: "neutral", label: "not_found" },
};

const LEGACY_UNVERIFIED_BADGE: LedgerStatusBadge = {
  variant: "warning",
  label: "legacy_unverified_evidence",
};

const WALLET_ANCHOR_BADGE: Record<WalletAnchorStatus, WalletAnchorBadge> = {
  pending: { variant: "pending", label: "pending" },
  anchored: { variant: "verified", label: "anchored" },
  failed: { variant: "destructive", label: "failed" },
};

export function isLedgerVerifyStatus(value: string | null | undefined): value is LedgerVerifyStatus {
  return Boolean(value && value in LEDGER_STATUS_BADGE);
}

/** Ledger-backed "Verified" is only true for status `verified` with no legacy-evidence detail. */
export function isLedgerVerified(status: string | null | undefined, detail?: string | null): boolean {
  return status === "verified" && detail !== "legacy_unverified_evidence";
}

/**
 * Public/recruiter "Verified" flag. The API `verified` boolean is ignored so
 * `ledger_unavailable`, `evidence_unavailable`, and `legacy_unverified_evidence`
 * can never render as verified.
 */
export function shareShowsVerified(input: {
  ledgerStatus?: string | null;
  verified?: boolean;
  detail?: string | null;
}): boolean {
  return isLedgerVerified(input.ledgerStatus, input.detail);
}

export function mapLedgerStatusToBadge(
  status: string | null | undefined,
  detail?: string | null,
): LedgerStatusBadge {
  if (detail === "legacy_unverified_evidence") {
    return LEGACY_UNVERIFIED_BADGE;
  }
  if (isLedgerVerifyStatus(status)) {
    return LEDGER_STATUS_BADGE[status];
  }
  return LEDGER_STATUS_BADGE.ledger_unavailable;
}

export function mapWalletAnchorStatus(status: string | null | undefined): WalletAnchorBadge | null {
  if (status === "pending" || status === "anchored" || status === "failed") {
    return WALLET_ANCHOR_BADGE[status];
  }
  return null;
}

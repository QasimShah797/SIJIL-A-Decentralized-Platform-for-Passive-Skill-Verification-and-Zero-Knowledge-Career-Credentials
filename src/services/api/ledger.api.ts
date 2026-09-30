/**
 * Public ledger verification client — GET /api/public/credentials/:id/verify.
 * Falls back to ledger_unavailable when VITE_API_BASE_URL is unset or the API is unreachable.
 */
import { tryApiRequest } from "./client";
import type { LedgerVerifyStatus, LedgerVerifyDetail } from "@/lib/ledger-status";

export type { LedgerVerifyStatus, LedgerVerifyDetail };

export interface LedgerVerifyResult {
  status: LedgerVerifyStatus;
  credentialId: string;
  hash: string | null;
  anchorTxId: string | null;
  anchoredAt: string | null;
  verifiedAt: string;
  detail?: LedgerVerifyDetail;
}

function unavailableResult(credentialId: string): LedgerVerifyResult {
  return {
    status: "ledger_unavailable",
    credentialId,
    hash: null,
    anchorTxId: null,
    anchoredAt: null,
    verifiedAt: new Date().toISOString(),
  };
}

export async function verifyCredentialLedgerApi(
  credentialId: string,
): Promise<LedgerVerifyResult> {
  const data = await tryApiRequest<LedgerVerifyResult>(
    `/public/credentials/${encodeURIComponent(credentialId)}/verify`,
  );
  if (!data) return unavailableResult(credentialId);
  return data;
}

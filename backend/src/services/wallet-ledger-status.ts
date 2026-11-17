/**
 * Wallet Fabric badge from a live ledger read, not from the database anchor_status alone.
 * Network or gateway errors yield "unavailable"; they are never treated as proof of absence.
 */
import type { LedgerPort } from "./ledger.types";
import { makeVerifyCache } from "./verify-cache";

export type WalletLedgerAnchorStatus =
  | "pending"
  | "failed"
  | "anchored"
  | "revoked"
  | "revocation_pending"
  | "not_on_ledger"
  | "hash_mismatch"
  | "unavailable";

export interface WalletLedgerRow {
  id: string;
  credential_hash?: string | null;
  anchor_status?: string | null;
  revoke_status?: string | null;
}

const CACHE_TTL_MS = 60_000;
const cache = makeVerifyCache<WalletLedgerAnchorStatus>(CACHE_TTL_MS);

export function clearWalletLedgerStatusCacheForTests(): void {
  cache.clear();
}

export function invalidateWalletLedgerStatus(credentialId: string): void {
  cache.invalidateCredential(credentialId);
}

export async function resolveWalletLedgerAnchorStatus(
  row: WalletLedgerRow,
  ledger: LedgerPort,
): Promise<WalletLedgerAnchorStatus | null> {
  const dbStatus = row.anchor_status ?? null;
  const tracked = dbStatus === "pending" || dbStatus === "failed" || dbStatus === "anchored";
  if (!tracked) return null;
  const hash = row.credential_hash ?? "";
  if (!hash || !ledger.isEnabled()) {
    if (dbStatus === "pending" || dbStatus === "failed") return dbStatus;
    return "unavailable";
  }

  const cached = cache.get(row.id, hash);
  if (cached) return cached;

  let status: WalletLedgerAnchorStatus;
  try {
    const result = await ledger.verifyCredential(row.id, hash);
    const revokePending = row.revoke_status === "pending" || row.revoke_status === "failed";
    if (!result.exists) {
      status = dbStatus === "failed" ? "failed" : dbStatus === "pending" ? "pending" : "not_on_ledger";
    } else if (!result.hashMatches) {
      status = "hash_mismatch";
    } else if (result.status === "revoked") {
      status = "revoked";
    } else if (revokePending) {
      status = "revocation_pending";
    } else {
      status = "anchored";
    }
  } catch {
    if (dbStatus === "pending" || dbStatus === "failed") return dbStatus;
    return "unavailable";
  }
  cache.set(row.id, hash, status);
  return status;
}

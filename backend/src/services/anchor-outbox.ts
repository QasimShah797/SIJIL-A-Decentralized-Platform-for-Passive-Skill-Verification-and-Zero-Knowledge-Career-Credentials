/**
 * Pure outbox processing for Fabric credential anchors (inject ledger + store).
 */
import {
  LedgerDisabledError,
  LedgerPermanentError,
  isAlreadyRevokedError,
  isDuplicateAnchorError,
  publicErrorMessage,
} from "./ledger.errors";
import type { LedgerPort } from "./ledger.types";

export interface OutboxCredential {
  id: string;
  credentialHash: string;
  issuerDid: string;
  holderDid: string;
  issuedAt: string;
  anchorStatus: string;
  anchorAttempts: number;
  updatedAt: string;
  createdAt: string;
  anchorTxId?: string | null;
  revokeStatus?: string;
  revokeAttempts?: number;
  revocationReason?: string;
}

export interface AnchorOutboxStore {
  listCandidates(limit: number, maxAttempts: number): Promise<OutboxCredential[]>;
  markAnchored(id: string, txId: string, anchoredAt: string): Promise<void>;
  markFailed(id: string, attempts: number, error: string, at: string): Promise<void>;
  getByIdOrUri(idOrUri: string): Promise<OutboxCredential | null>;
  resetForRetry(id: string, at: string): Promise<OutboxCredential>;
  countByStatus(status: "pending" | "failed"): Promise<number>;
  listRevokeCandidates(limit: number, maxAttempts: number): Promise<OutboxCredential[]>;
  markRevokeSucceeded(id: string, txId: string, at: string): Promise<void>;
  markRevokeFailed(id: string, attempts: number, error: string, at: string): Promise<void>;
}

export interface AnchorWorkerOptions {
  ledger: LedgerPort;
  store: AnchorOutboxStore;
  batchSize: number;
  maxAttempts: number;
  backoffBaseMs: number;
  now?: () => Date;
}

export interface AnchorBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export function isAnchorDue(
  row: OutboxCredential,
  now: Date,
  backoffBaseMs: number,
): boolean {
  if (row.anchorAttempts <= 0) {
    return true;
  }
  const waitMs = backoffBaseMs * 2 ** (row.anchorAttempts - 1);
  return now.getTime() >= new Date(row.updatedAt).getTime() + waitMs;
}

export async function processAnchorBatch(options: AnchorWorkerOptions): Promise<AnchorBatchResult> {
  const result: AnchorBatchResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  if (!options.ledger.isEnabled()) {
    return result;
  }

  const now = options.now?.() ?? new Date();
  const candidates = await options.store.listCandidates(options.batchSize * 3, options.maxAttempts);
  const due = candidates.filter((row) => isAnchorDue(row, now, options.backoffBaseMs)).slice(0, options.batchSize);

  for (const row of due) {
    const outcome = await processOneAnchor(row, options, now, false);
    result.processed += 1;
    if (outcome === "succeeded") result.succeeded += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}

export async function processOneAnchor(
  row: OutboxCredential,
  options: AnchorWorkerOptions,
  now: Date,
  ignoreBackoff: boolean,
): Promise<"succeeded" | "failed" | "skipped"> {
  if (!options.ledger.isEnabled()) {
    return "skipped";
  }
  if (!ignoreBackoff && !isAnchorDue(row, now, options.backoffBaseMs)) {
    return "skipped";
  }
  if (!row.credentialHash) {
    await options.store.markFailed(
      row.id,
      options.maxAttempts,
      "credential hash is missing",
      now.toISOString(),
    );
    return "failed";
  }

  try {
    const anchored = await options.ledger.anchorCredential({
      credentialId: row.id,
      hash: row.credentialHash,
      issuerDid: row.issuerDid,
      holderDid: row.holderDid,
      issuedAt: row.issuedAt,
    });
    await options.store.markAnchored(row.id, anchored.txId, now.toISOString());
    return "succeeded";
  } catch (err) {
    if (err instanceof LedgerDisabledError) {
      return "skipped";
    }
    if (isDuplicateAnchorError(err)) {
      try {
        const verify = await options.ledger.verifyCredential(row.id, row.credentialHash);
        if (verify.exists && verify.hashMatches) {
          await options.store.markAnchored(row.id, "already-anchored", now.toISOString());
          return "succeeded";
        }
        await options.store.markFailed(
          row.id,
          options.maxAttempts,
          "already anchored with a different hash",
          now.toISOString(),
        );
        return "failed";
      } catch (verifyErr) {
        await failTransient(row, options, verifyErr, now);
        return "failed";
      }
    }
    if (err instanceof LedgerPermanentError) {
      await options.store.markFailed(row.id, options.maxAttempts, publicErrorMessage(err), now.toISOString());
      return "failed";
    }
    await failTransient(row, options, err, now);
    return "failed";
  }
}

async function failTransient(
  row: OutboxCredential,
  options: AnchorWorkerOptions,
  err: unknown,
  now: Date,
): Promise<void> {
  const attempts = Math.min(row.anchorAttempts + 1, options.maxAttempts);
  await options.store.markFailed(row.id, attempts, publicErrorMessage(err), now.toISOString());
}

export async function processRevokeBatch(options: AnchorWorkerOptions): Promise<AnchorBatchResult> {
  const result: AnchorBatchResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  if (!options.ledger.isEnabled()) {
    return result;
  }

  const now = options.now?.() ?? new Date();
  const candidates = await options.store.listRevokeCandidates(options.batchSize * 3, options.maxAttempts);
  const due = candidates
    .filter((row) => isRevokeDue(row, now, options.backoffBaseMs))
    .slice(0, options.batchSize);

  for (const row of due) {
    const outcome = await processOneRevoke(row, options, now);
    result.processed += 1;
    if (outcome === "succeeded") result.succeeded += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}

function isRevokeDue(row: OutboxCredential, now: Date, backoffBaseMs: number): boolean {
  const attempts = row.revokeAttempts ?? 0;
  if (attempts <= 0) return true;
  const waitMs = backoffBaseMs * 2 ** (attempts - 1);
  return now.getTime() >= new Date(row.updatedAt).getTime() + waitMs;
}

async function processOneRevoke(
  row: OutboxCredential,
  options: AnchorWorkerOptions,
  now: Date,
): Promise<"succeeded" | "failed" | "skipped"> {
  if (!options.ledger.isEnabled()) {
    return "skipped";
  }
  if (row.anchorStatus !== "anchored") {
    return "skipped";
  }
  const reason = (row.revocationReason ?? "").trim() || "unspecified";

  try {
    const revoked = await options.ledger.revokeCredential(row.id, reason);
    await options.store.markRevokeSucceeded(row.id, revoked.txId, now.toISOString());
    return "succeeded";
  } catch (err) {
    if (err instanceof LedgerDisabledError) {
      return "skipped";
    }
    if (isAlreadyRevokedError(err)) {
      await options.store.markRevokeSucceeded(row.id, "already-revoked", now.toISOString());
      return "succeeded";
    }
    if (err instanceof LedgerPermanentError) {
      await options.store.markRevokeFailed(
        row.id,
        options.maxAttempts,
        publicErrorMessage(err),
        now.toISOString(),
      );
      return "failed";
    }
    const attempts = Math.min((row.revokeAttempts ?? 0) + 1, options.maxAttempts);
    await options.store.markRevokeFailed(row.id, attempts, publicErrorMessage(err), now.toISOString());
    return "failed";
  }
}

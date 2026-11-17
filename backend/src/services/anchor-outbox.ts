/**
 * Pure outbox processing for Fabric credential anchors (inject ledger + store).
 */
import { randomUUID } from "node:crypto";
import {
  LedgerDisabledError,
  LedgerPermanentError,
  isAlreadyRevokedError,
  isDuplicateAnchorError,
  publicErrorMessage,
} from "./ledger.errors";
import type { LedgerPort } from "./ledger.types";

/** Claim columns are not on the database yet. The tick must stop rather than submit without a lease. */
export class QueueSchemaMissingError extends Error {
  constructor() {
    super("anchor claim columns are not applied; queue was not submitted");
    this.name = "QueueSchemaMissingError";
  }
}

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
  claimToken?: string | null;
}

export interface AnchorOutboxStore {
  listCandidates(limit: number, maxAttempts: number): Promise<OutboxCredential[]>;
  markAnchored(id: string, txId: string, anchoredAt: string, claimToken?: string): Promise<void>;
  /** Returns the claimed row, or null when another worker holds the lease. */
  claimAnchor?(id: string, token: string, until: string): Promise<OutboxCredential | null>;
  claimRevoke?(id: string, token: string, until: string): Promise<OutboxCredential | null>;
  /** Revoked before any anchor existed. Does not submit a Fabric transaction. */
  markAnchorSuppressed?(id: string, at: string): Promise<void>;
  markFailed(id: string, attempts: number, error: string, at: string): Promise<void>;
  getByIdOrUri(idOrUri: string): Promise<OutboxCredential | null>;
  resetForRetry(id: string, at: string): Promise<OutboxCredential>;
  countByStatus(status: "pending" | "failed"): Promise<number>;
  countRevokeByStatus?(status: "pending" | "failed"): Promise<number | null>;
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
  /** When true, the worker does not submit existing or new anchors. */
  queueHeld?: boolean;
  /** Only rows created at or after this ISO time are eligible. */
  notBefore?: string;
  /** When false, RevokeCredential is not submitted. */
  revocationSubmit?: boolean;
  leaseMs?: number;
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
  if (!options.ledger.isEnabled() || options.queueHeld) {
    return result;
  }

  const now = options.now?.() ?? new Date();
  const candidates = await options.store.listCandidates(options.batchSize * 3, options.maxAttempts);
  const due = candidates
    .filter((row) => isAnchorDue(row, now, options.backoffBaseMs))
    .filter((row) => !options.notBefore || row.createdAt >= options.notBefore)
    .slice(0, options.batchSize);

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
  if (row.revokeStatus && row.revokeStatus !== "not_required") {
    return "skipped";
  }
  const claimed = await claimRow(options.store.claimAnchor, row, options, now);
  if (!claimed) return "skipped";
  row = claimed;

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
    await options.store.markAnchored(row.id, anchored.txId, now.toISOString(), row.claimToken ?? undefined);
    return "succeeded";
  } catch (err) {
    if (err instanceof LedgerDisabledError) {
      return "skipped";
    }
    if (isDuplicateAnchorError(err)) {
      try {
        const verify = await options.ledger.verifyCredential(row.id, row.credentialHash);
        if (verify.exists && verify.hashMatches) {
          await options.store.markAnchored(row.id, "already-anchored", now.toISOString(), row.claimToken ?? undefined);
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
  if (!options.ledger.isEnabled() || options.revocationSubmit === false) {
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
  const claimed = await claimRow(options.store.claimRevoke, row, options, now);
  if (!claimed) return "skipped";
  row = claimed;

  if (row.anchorStatus !== "anchored") {
    try {
      const view = await options.ledger.verifyCredential(row.id, row.credentialHash);
      if (!view.exists) {
        await options.store.markAnchorSuppressed?.(row.id, now.toISOString());
        await options.store.markRevokeSucceeded(row.id, "revoked-before-anchor", now.toISOString());
        return "succeeded";
      }
    } catch (err) {
      if (err instanceof LedgerDisabledError) return "skipped";
      const attempts = Math.min((row.revokeAttempts ?? 0) + 1, options.maxAttempts);
      await options.store.markRevokeFailed(row.id, attempts, publicErrorMessage(err), now.toISOString());
      return "failed";
    }
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

async function claimRow(
  claim: ((id: string, token: string, until: string) => Promise<OutboxCredential | null>) | undefined,
  row: OutboxCredential,
  options: AnchorWorkerOptions,
  now: Date,
): Promise<OutboxCredential | null> {
  if (!claim) return row;
  const token = randomUUID();
  const until = new Date(now.getTime() + (options.leaseMs ?? 60_000)).toISOString();
  const claimed = await claim(row.id, token, until);
  if (!claimed) return null;
  return { ...claimed, claimToken: token };
}

export function anchorQueueHeld(notBefore: string | undefined): boolean {
  if (!notBefore) return true;
  return Number.isNaN(Date.parse(notBefore));
}

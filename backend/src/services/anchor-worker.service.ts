/**
 * Outbox worker: anchors pending/failed credentials on Fabric with exponential backoff.
 */
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { supabaseService } from "./supabase.service";
import { getLedgerService } from "./ledger.factory";
import { publicErrorMessage } from "./ledger.errors";
import {
  processAnchorBatch,
  processOneAnchor,
  processRevokeBatch,
  type AnchorOutboxStore,
  type OutboxCredential,
} from "./anchor-outbox";

export {
  processAnchorBatch,
  processOneAnchor,
  processRevokeBatch,
  isAnchorDue,
  type AnchorOutboxStore,
  type OutboxCredential,
  type AnchorWorkerOptions,
  type AnchorBatchResult,
} from "./anchor-outbox";

const uuidSchema = z.string().uuid();

export interface AnchorRetryResult {
  id: string;
  anchorStatus: string;
  anchorTxId: string | null;
}

let timer: NodeJS.Timeout | undefined;
let tickRunning = false;

export async function retryCredentialAnchor(idOrUri: string): Promise<AnchorRetryResult> {
  const ledger = getLedgerService();
  if (!ledger.isEnabled()) {
    throw new AppError("Ledger is disabled (FABRIC_ENABLED=false)", 503);
  }

  const store = supabaseAnchorStore;
  const existing = await store.getByIdOrUri(idOrUri);
  if (!existing) {
    throw new AppError("Credential not found", 404);
  }
  if (existing.anchorStatus === "anchored") {
    return { id: existing.id, anchorStatus: "anchored", anchorTxId: existing.anchorTxId ?? null };
  }
  if (!existing.credentialHash) {
    throw new AppError("Credential hash is missing; cannot anchor", 400);
  }

  const now = new Date();
  const pending = await store.resetForRetry(existing.id, now.toISOString());
  await processOneAnchor(
    pending,
    {
      ledger,
      store,
      batchSize: env.FABRIC_ANCHOR_BATCH_SIZE,
      maxAttempts: env.FABRIC_ANCHOR_MAX_ATTEMPTS,
      backoffBaseMs: env.FABRIC_ANCHOR_BACKOFF_MS,
    },
    now,
    true,
  );
  const latest = await store.getByIdOrUri(pending.id);
  if (!latest) {
    throw new AppError("Credential not found after retry", 404);
  }
  return {
    id: latest.id,
    anchorStatus: latest.anchorStatus,
    anchorTxId: latest.anchorTxId ?? null,
  };
}

export async function getAnchorQueueCounts(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    supabaseAnchorStore.countByStatus("pending"),
    supabaseAnchorStore.countByStatus("failed"),
  ]);
  return { pending, failed };
}

export function startAnchorWorker(): void {
  const intervalMs = env.FABRIC_ANCHOR_INTERVAL_MS;
  void runScheduledTick();
  timer = setInterval(() => {
    void runScheduledTick();
  }, intervalMs);
  timer.unref?.();
  console.log(`[anchor-worker] started intervalMs=${intervalMs} fabricEnabled=${env.FABRIC_ENABLED}`);
}

export function stopAnchorWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  getLedgerService().close();
}

async function runScheduledTick(): Promise<void> {
  if (tickRunning) {
    return;
  }
  tickRunning = true;
  try {
    await processAnchorBatch({
      ledger: getLedgerService(),
      store: supabaseAnchorStore,
      batchSize: env.FABRIC_ANCHOR_BATCH_SIZE,
      maxAttempts: env.FABRIC_ANCHOR_MAX_ATTEMPTS,
      backoffBaseMs: env.FABRIC_ANCHOR_BACKOFF_MS,
    });
    await processRevokeBatch({
      ledger: getLedgerService(),
      store: supabaseAnchorStore,
      batchSize: env.FABRIC_ANCHOR_BATCH_SIZE,
      maxAttempts: env.FABRIC_ANCHOR_MAX_ATTEMPTS,
      backoffBaseMs: env.FABRIC_ANCHOR_BACKOFF_MS,
    });
  } catch (err) {
    console.error("[anchor-worker] tick failed:", publicErrorMessage(err));
  } finally {
    tickRunning = false;
  }
}

function asOutboxRow(value: Record<string, unknown>): OutboxCredential {
  return {
    id: String(value.id ?? ""),
    credentialHash: typeof value.credential_hash === "string" ? value.credential_hash : "",
    issuerDid: String(value.issuer_did ?? ""),
    holderDid: String(value.holder_did ?? ""),
    issuedAt: String(value.valid_from ?? ""),
    anchorStatus: String(value.anchor_status ?? "pending"),
    anchorAttempts: typeof value.anchor_attempts === "number" ? value.anchor_attempts : 0,
    updatedAt: String(value.updated_at ?? new Date(0).toISOString()),
    createdAt: String(value.created_at ?? new Date(0).toISOString()),
    anchorTxId: typeof value.anchor_tx_id === "string" ? value.anchor_tx_id : null,
    revokeStatus: typeof value.revoke_status === "string" ? value.revoke_status : "not_required",
    revokeAttempts: typeof value.revoke_attempts === "number" ? value.revoke_attempts : 0,
    revocationReason: typeof value.revocation_reason === "string" ? value.revocation_reason : "",
  };
}

export const supabaseAnchorStore: AnchorOutboxStore = {
  async listCandidates(limit, maxAttempts) {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select(
        "id, credential_hash, issuer_did, holder_did, valid_from, anchor_status, anchor_attempts, updated_at, created_at, anchor_tx_id",
      )
      .in("anchor_status", ["pending", "failed"])
      .lt("anchor_attempts", maxAttempts)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => asOutboxRow(row as Record<string, unknown>));
  },

  async markAnchored(id, txId, anchoredAt) {
    const { error } = await supabaseService.client
      .from("credentials")
      .update({
        anchor_status: "anchored",
        anchor_tx_id: txId,
        anchored_at: anchoredAt,
        anchor_last_error: null,
        updated_at: anchoredAt,
      })
      .eq("id", id);

    if (error) throw new AppError(error.message, 500);
  },

  async markFailed(id, attempts, errorMessage, at) {
    const { error } = await supabaseService.client
      .from("credentials")
      .update({
        anchor_status: "failed",
        anchor_attempts: attempts,
        anchor_last_error: errorMessage,
        updated_at: at,
      })
      .eq("id", id);

    if (error) throw new AppError(error.message, 500);
  },

  async getByIdOrUri(idOrUri) {
    const client = supabaseService.client;
    const byUuid = uuidSchema.safeParse(idOrUri);
    const query = byUuid.success
      ? client.from("credentials").select("*").eq("id", idOrUri).maybeSingle()
      : client.from("credentials").select("*").eq("credential_uri", idOrUri).maybeSingle();

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    if (data) return asOutboxRow(data as Record<string, unknown>);

    if (byUuid.success) {
      const fallback = await client.from("credentials").select("*").eq("credential_uri", idOrUri).maybeSingle();
      if (fallback.error) throw new AppError(fallback.error.message, 500);
      if (fallback.data) return asOutboxRow(fallback.data as Record<string, unknown>);
    }
    return null;
  },

  async resetForRetry(id, at) {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .update({
        anchor_status: "pending",
        anchor_attempts: 0,
        anchor_last_error: null,
        updated_at: at,
      })
      .eq("id", id)
      .select(
        "id, credential_hash, issuer_did, holder_did, valid_from, anchor_status, anchor_attempts, updated_at, created_at, anchor_tx_id",
      )
      .single();

    if (error) throw new AppError(error.message, 500);
    return asOutboxRow(data as Record<string, unknown>);
  },

  async countByStatus(status) {
    const { count, error } = await supabaseService.client
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("anchor_status", status);

    if (error) throw new AppError(error.message, 500);
    return count ?? 0;
  },

  async listRevokeCandidates(limit, maxAttempts) {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select(
        "id, credential_hash, issuer_did, holder_did, valid_from, anchor_status, anchor_attempts, updated_at, created_at, anchor_tx_id, revoke_status, revoke_attempts, revocation_reason",
      )
      .in("revoke_status", ["pending", "failed"])
      .lt("revoke_attempts", maxAttempts)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => asOutboxRow(row as Record<string, unknown>));
  },

  async markRevokeSucceeded(id, txId, at) {
    const { error } = await supabaseService.client
      .from("credentials")
      .update({
        revoke_status: "revoked",
        revoke_tx_id: txId,
        revoke_last_error: null,
        updated_at: at,
      })
      .eq("id", id);

    if (error) throw new AppError(error.message, 500);
  },

  async markRevokeFailed(id, attempts, errorMessage, at) {
    const { error } = await supabaseService.client
      .from("credentials")
      .update({
        revoke_status: "failed",
        revoke_attempts: attempts,
        revoke_last_error: errorMessage,
        updated_at: at,
      })
      .eq("id", id);

    if (error) throw new AppError(error.message, 500);
  },
};

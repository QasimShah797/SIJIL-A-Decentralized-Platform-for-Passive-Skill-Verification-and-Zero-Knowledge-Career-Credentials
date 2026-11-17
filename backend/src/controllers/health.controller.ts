/**
 * Health check controller — public liveness plus admin ledger outbox stats.
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { getEvaluateLedgerService, getLedgerService } from "../services/ledger.factory";
import { supabaseService } from "../services/supabase.service";
import { getAnchorQueueCounts } from "../services/anchor-worker.service";
import { anchorQueueHeld } from "../services/anchor-outbox";
import { env } from "../config/env";
import { publicErrorMessage } from "../services/ledger.errors";
import { publicHealthPayload } from "./health.payload";

export { publicHealthPayload };

export async function healthCheck(_req: Request, res: Response): Promise<Response> {
  return sendSuccess(res, publicHealthPayload());
}

export async function healthOutbox(_req: Request, res: Response): Promise<Response> {
  const ledger = getLedgerService();
  const enabled = ledger.isEnabled();
  const reachable = enabled ? await ledger.isReachable() : false;

  let pendingAnchors = 0;
  let failedAnchors = 0;
  let pendingRevocations: number | null = null;
  let failedRevocations: number | null = null;
  try {
    const counts = await getAnchorQueueCounts();
    pendingAnchors = counts.pending;
    failedAnchors = counts.failed;
    pendingRevocations = counts.revokePending;
    failedRevocations = counts.revokeFailed;
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "health_outbox_failed",
      message: publicErrorMessage(err),
    }));
  }

  return sendSuccess(res, {
    status: "ok",
    service: "sijil-backend",
    timestamp: new Date().toISOString(),
    ledger: {
      enabled,
      reachable,
      queueHeld: anchorQueueHeld(env.FABRIC_ANCHOR_NOT_BEFORE),
      revocationSubmit: env.FABRIC_REVOCATION_SUBMIT,
      pendingAnchors,
      failedAnchors,
      pendingRevocations,
      failedRevocations,
    },
  });
}

export async function healthReady(_req: Request, res: Response): Promise<Response> {
  const database = await databaseReady();
  const ledger = getEvaluateLedgerService();
  const ledgerReady = ledger.isEnabled() ? await ledger.isReachable() : false;
  const ready = database;
  return sendSuccess(res, {
    status: ready ? "ready" : "not_ready",
    database,
    ledger: ledger.isEnabled() ? ledgerReady : "disabled",
  }, undefined, ready ? 200 : 503);
}

async function databaseReady(): Promise<boolean> {
  try {
    const { error } = await supabaseService.client.from("credentials").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

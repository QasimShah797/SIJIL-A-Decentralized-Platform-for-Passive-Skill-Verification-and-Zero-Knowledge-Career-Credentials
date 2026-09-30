/**
 * Health check controller — public liveness plus admin ledger outbox stats.
 */
import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { getLedgerService } from "../services/ledger.factory";
import { getAnchorQueueCounts } from "../services/anchor-worker.service";
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
  try {
    const counts = await getAnchorQueueCounts();
    pendingAnchors = counts.pending;
    failedAnchors = counts.failed;
  } catch (err) {
    console.error("[health] anchor queue counts failed:", publicErrorMessage(err));
  }

  return sendSuccess(res, {
    status: "ok",
    service: "sijil-backend",
    timestamp: new Date().toISOString(),
    ledger: {
      enabled,
      reachable,
      pendingAnchors,
      failedAnchors,
    },
  });
}

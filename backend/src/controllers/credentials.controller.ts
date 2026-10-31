/**
 * Credential issuing and wallet HTTP handlers — delegate to credentialsService.
 */
import { Request, Response } from "express";
import { credentialsService } from "../services/credentials.service";
import { retryCredentialAnchor } from "../services/anchor-worker.service";
import { revokeIssuedCredential } from "../services/credential-verify.service";
import { sendSuccess } from "../utils/apiResponse";
import {
  issueCredentialSchema,
  shareCredentialSchema,
  revokeShareSchema,
  revokeCredentialSchema,
} from "../validators/credentials.validator";
import { paramString } from "../utils/params";
import { callerFromRequest } from "../services/learner-access";
import { z } from "zod";
import {
  previewReconciliation,
  reconcileCredentialAnchor,
  type ReconcileDeps,
} from "../services/anchor-reconciliation.service";
import { supabaseReconcileStore } from "../services/anchor-reconciliation.store";
import { getLedgerService } from "../services/ledger.factory";
import { publicVerifyCache } from "../services/verify-cache";
import { invalidateWalletLedgerStatus } from "../services/wallet-ledger-status";

const reconcileParamSchema = z.object({ id: z.string().uuid() });
const reconcileBodySchema = z.object({
  approve: z.literal(true),
  expectedHash: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function issueCredential(req: Request, res: Response): Promise<Response> {
  const input = issueCredentialSchema.parse(req.body);
  const credential = await credentialsService.issue(req.user!.id, input);
  return sendSuccess(res, credential, "Credential issued", 201);
}

export async function getCredential(req: Request, res: Response): Promise<Response> {
  const credential = await credentialsService.getByUri(
    paramString(req.params.id, "id"),
    callerFromRequest(req),
  );
  return sendSuccess(res, credential);
}

export async function getWallet(req: Request, res: Response): Promise<Response> {
  const credentials = await credentialsService.getWallet(
    paramString(req.params.learnerId, "learnerId"),
    callerFromRequest(req),
  );
  return sendSuccess(res, credentials);
}

export async function shareCredential(req: Request, res: Response): Promise<Response> {
  const input = shareCredentialSchema.parse(req.body);
  const result = await credentialsService.share(req.user!.id, input);
  return sendSuccess(res, result, "Presentation shared", 201);
}

export async function revokeShare(req: Request, res: Response): Promise<Response> {
  const input = revokeShareSchema.parse(req.body);
  await credentialsService.revokeShare(req.user!.id, input);
  return sendSuccess(res, null, "Share revoked");
}

export async function retryAnchor(req: Request, res: Response): Promise<Response> {
  const result = await retryCredentialAnchor(paramString(req.params.id, "id"));
  return sendSuccess(res, result, "Anchor retry completed");
}

function reconcileDeps(): ReconcileDeps {
  return {
    store: supabaseReconcileStore,
    ledger: getLedgerService(),
    onReconciled: (id) => {
      publicVerifyCache.invalidateCredential(id);
      invalidateWalletLedgerStatus(id);
    },
  };
}

/** Admin read-only preview: current ledger state and the action reconciliation would take. */
export async function previewLedgerReconcile(req: Request, res: Response): Promise<Response> {
  const { id } = reconcileParamSchema.parse({ id: paramString(req.params.id, "id") });
  return sendSuccess(res, await previewReconciliation(id, reconcileDeps()));
}

/** Admin-approved reconciliation of one credential recorded as anchored but missing from the ledger. */
export async function reconcileLedgerAnchor(req: Request, res: Response): Promise<Response> {
  const { id } = reconcileParamSchema.parse({ id: paramString(req.params.id, "id") });
  const body = reconcileBodySchema.parse(req.body ?? {});
  const result = await reconcileCredentialAnchor(
    { credentialId: id, expectedHash: body.expectedHash, reason: body.reason, requestedBy: req.user!.id },
    reconcileDeps(),
  );
  return sendSuccess(res, result, result.outcome === "reconciled" ? "Credential re-anchored" : "Already on ledger");
}

export async function revokeCredential(req: Request, res: Response): Promise<Response> {
  const input = revokeCredentialSchema.parse(req.body);
  const result = await revokeIssuedCredential(paramString(req.params.id, "id"), input.reason);
  return sendSuccess(res, result, "Credential revoked");
}

/**
 * Administrator-approved reconciliation for credentials recorded as anchored in the database
 * but absent from the configured Fabric ledger. Never runs automatically.
 *
 * Safeguards: reads the ledger first; requires the admin to confirm the stored hash; refuses
 * conflicting hashes and revoked credentials; never reissues or edits the credential document;
 * records the previous transaction ID and reason in durable audit history before any write;
 * one in-flight reconciliation per credential (process lock + database unique index).
 */
import { AppError } from "../utils/AppError";
import { publicErrorMessage } from "./ledger.errors";
import type { LedgerPort } from "./ledger.types";

export interface ReconcileCredential {
  id: string;
  credentialHash: string | null;
  anchorStatus: string | null;
  anchorTxId: string | null;
  anchoredAt: string | null;
  revokedAt: string | null;
  revokeStatus: string | null;
  issuerDid: string;
  holderDid: string;
  issuedAt: string;
}

export type ReconcileAuditOutcome =
  | "already_on_ledger"
  | "refused_conflicting_hash"
  | "refused_revoked"
  | "refused_hash_confirmation"
  | "refused_not_anchored"
  | "in_progress"
  | "completed"
  | "failed";

export interface ReconcileAuditInput {
  credentialId: string;
  outcome: ReconcileAuditOutcome;
  reason: string;
  requestedBy: string;
  expectedHash: string | null;
  previousAnchorTxId: string | null;
  previousAnchoredAt: string | null;
  ledgerExists: boolean | null;
  ledgerHashMatches: boolean | null;
}

export interface ReconcileStore {
  getCredential(id: string): Promise<ReconcileCredential | null>;
  /** Inserts an audit row; throws ReconcileInProgressError when an in-progress row exists. */
  recordAudit(input: ReconcileAuditInput): Promise<string>;
  completeAudit(auditId: string, outcome: "completed" | "failed", detail: { newAnchorTxId?: string; error?: string }): Promise<void>;
  /** Compare-and-set: only updates while the row still holds the previous anchor record. */
  replaceAnchorTx(id: string, previousTxId: string | null, newTxId: string, at: string): Promise<boolean>;
}

export class ReconcileInProgressError extends Error {}

export interface ReconcileDeps {
  store: ReconcileStore;
  ledger: LedgerPort;
  now?: () => Date;
  onReconciled?: (credentialId: string) => void;
}

export interface ReconcileRequest {
  credentialId: string;
  expectedHash: string;
  reason: string;
  requestedBy: string;
}

export type ReconcilePlan =
  | { action: "anchor_missing"; ledgerExists: false }
  | { action: "none_already_on_ledger"; ledgerExists: true; hashMatches: true }
  | { action: "refuse_conflicting_hash"; ledgerExists: true; hashMatches: false }
  | { action: "refuse_revoked" }
  | { action: "refuse_not_anchored"; anchorStatus: string | null };

export interface ReconcileResult {
  credentialId: string;
  outcome: "already_on_ledger" | "reconciled";
  previousAnchorTxId: string | null;
  anchorTxId: string | null;
  auditId: string;
}

const inFlight = new Set<string>();

function isRevoked(credential: ReconcileCredential): boolean {
  const status = credential.revokeStatus ?? "not_required";
  return Boolean(credential.revokedAt) || (status !== "" && status !== "not_required");
}

async function readLedger(ledger: LedgerPort, credential: ReconcileCredential) {
  if (!ledger.isEnabled() || !credential.credentialHash) {
    throw new AppError("Fabric verification unavailable; nothing was changed", 503);
  }
  try {
    return await ledger.verifyCredential(credential.id, credential.credentialHash);
  } catch {
    // A network or gateway error is not evidence that the anchor is missing.
    throw new AppError("Fabric verification unavailable; nothing was changed", 503);
  }
}

async function loadCredential(store: ReconcileStore, id: string): Promise<ReconcileCredential> {
  const credential = await store.getCredential(id);
  if (!credential) throw new AppError("Credential not found", 404);
  return credential;
}

/** Read-only preview for administrators; performs no writes. */
export async function previewReconciliation(credentialId: string, deps: ReconcileDeps): Promise<ReconcilePlan> {
  const credential = await loadCredential(deps.store, credentialId);
  if (credential.anchorStatus !== "anchored") return { action: "refuse_not_anchored", anchorStatus: credential.anchorStatus };
  if (isRevoked(credential)) return { action: "refuse_revoked" };
  const view = await readLedger(deps.ledger, credential);
  if (!view.exists) return { action: "anchor_missing", ledgerExists: false };
  if (!view.hashMatches) return { action: "refuse_conflicting_hash", ledgerExists: true, hashMatches: false };
  return { action: "none_already_on_ledger", ledgerExists: true, hashMatches: true };
}

export async function reconcileCredentialAnchor(request: ReconcileRequest, deps: ReconcileDeps): Promise<ReconcileResult> {
  const { credentialId } = request;
  if (inFlight.has(credentialId)) {
    throw new AppError("Reconciliation already in progress for this credential", 409);
  }
  inFlight.add(credentialId);
  try {
    return await runReconciliation(request, deps);
  } finally {
    inFlight.delete(credentialId);
  }
}

async function runReconciliation(request: ReconcileRequest, deps: ReconcileDeps): Promise<ReconcileResult> {
  const { store, ledger } = deps;
  const credential = await loadCredential(store, request.credentialId);
  const audit = (outcome: ReconcileAuditOutcome, ledgerExists: boolean | null, ledgerHashMatches: boolean | null) =>
    store.recordAudit({
      credentialId: credential.id,
      outcome,
      reason: request.reason,
      requestedBy: request.requestedBy,
      expectedHash: request.expectedHash,
      previousAnchorTxId: credential.anchorTxId,
      previousAnchoredAt: credential.anchoredAt,
      ledgerExists,
      ledgerHashMatches,
    });

  if (credential.anchorStatus !== "anchored") {
    await audit("refused_not_anchored", null, null);
    throw new AppError("Only credentials recorded as anchored can be reconciled; use the anchor retry for failed credentials", 409);
  }
  if (isRevoked(credential)) {
    await audit("refused_revoked", null, null);
    throw new AppError("Revoked credentials are not reconciled automatically", 409);
  }
  if (!credential.credentialHash || request.expectedHash !== credential.credentialHash) {
    await audit("refused_hash_confirmation", null, null);
    throw new AppError("Confirmed hash does not match the stored credential hash", 409);
  }

  const view = await readLedger(ledger, credential);
  if (view.exists && view.hashMatches) {
    const auditId = await audit("already_on_ledger", true, true);
    return {
      credentialId: credential.id,
      outcome: "already_on_ledger",
      previousAnchorTxId: credential.anchorTxId,
      anchorTxId: credential.anchorTxId,
      auditId,
    };
  }
  if (view.exists) {
    await audit("refused_conflicting_hash", true, false);
    throw new AppError("Ledger holds a different hash for this credential; refusing to overwrite", 409);
  }

  let auditId: string;
  try {
    auditId = await audit("in_progress", false, false);
  } catch (err) {
    if (err instanceof ReconcileInProgressError) {
      throw new AppError("Reconciliation already in progress for this credential", 409);
    }
    throw err;
  }

  try {
    const anchored = await ledger.anchorCredential({
      credentialId: credential.id,
      hash: credential.credentialHash,
      issuerDid: credential.issuerDid,
      holderDid: credential.holderDid,
      issuedAt: credential.issuedAt,
    });
    const at = (deps.now?.() ?? new Date()).toISOString();
    const updated = await store.replaceAnchorTx(credential.id, credential.anchorTxId, anchored.txId, at);
    if (!updated) {
      await store.completeAudit(auditId, "failed", {
        newAnchorTxId: anchored.txId,
        error: "credential anchor record changed concurrently; database not updated",
      });
      throw new AppError("Credential anchor record changed during reconciliation", 409);
    }
    await store.completeAudit(auditId, "completed", { newAnchorTxId: anchored.txId });
    deps.onReconciled?.(credential.id);
    return {
      credentialId: credential.id,
      outcome: "reconciled",
      previousAnchorTxId: credential.anchorTxId,
      anchorTxId: anchored.txId,
      auditId,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    await store.completeAudit(auditId, "failed", { error: publicErrorMessage(err) });
    throw new AppError("Fabric anchoring failed; credential record unchanged", 502);
  }
}

import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";
import { ReconcileInProgressError, type ReconcileStore } from "./anchor-reconciliation.service";

const AUDIT_TABLE = "credential_anchor_reconciliations";

function auditUnavailable(error: unknown): AppError | null {
  if (isMissingRelationError(error) || isMissingColumnError(error)) {
    return new AppError("Reconciliation audit table is not applied; nothing was changed", 503);
  }
  return null;
}

export const supabaseReconcileStore: ReconcileStore = {
  async getCredential(id) {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select("id, credential_hash, anchor_status, anchor_tx_id, anchored_at, revoked_at, revoke_status, issuer_did, holder_did, valid_from")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new AppError("Could not load credential", 500);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    return {
      id: String(row.id),
      credentialHash: text(row.credential_hash),
      anchorStatus: text(row.anchor_status),
      anchorTxId: text(row.anchor_tx_id),
      anchoredAt: text(row.anchored_at),
      revokedAt: text(row.revoked_at),
      revokeStatus: text(row.revoke_status),
      issuerDid: text(row.issuer_did) ?? "",
      holderDid: text(row.holder_did) ?? "",
      issuedAt: text(row.valid_from) ?? "",
    };
  },

  async recordAudit(input) {
    const { data, error } = await supabaseService.client
      .from(AUDIT_TABLE)
      .insert({
        credential_id: input.credentialId,
        outcome: input.outcome,
        reason: input.reason,
        requested_by: input.requestedBy,
        expected_hash: input.expectedHash,
        previous_anchor_tx_id: input.previousAnchorTxId,
        previous_anchored_at: input.previousAnchoredAt,
        ledger_exists: input.ledgerExists,
        ledger_hash_matches: input.ledgerHashMatches,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") throw new ReconcileInProgressError("in progress");
      throw auditUnavailable(error) ?? new AppError("Could not record reconciliation audit", 500);
    }
    return String((data as { id: unknown }).id);
  },

  async completeAudit(auditId, outcome, detail) {
    const { error } = await supabaseService.client
      .from(AUDIT_TABLE)
      .update({
        outcome,
        new_anchor_tx_id: detail.newAnchorTxId ?? null,
        error: detail.error ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", auditId)
      .eq("outcome", "in_progress");
    if (error) throw auditUnavailable(error) ?? new AppError("Could not complete reconciliation audit", 500);
  },

  async replaceAnchorTx(id, previousTxId, newTxId, at) {
    let query = supabaseService.client
      .from("credentials")
      .update({ anchor_tx_id: newTxId, anchored_at: at, anchor_last_error: null, updated_at: at })
      .eq("id", id)
      .eq("anchor_status", "anchored");
    query = previousTxId === null ? query.is("anchor_tx_id", null) : query.eq("anchor_tx_id", previousTxId);
    const { data, error } = await query.select("id");
    if (error) throw new AppError("Could not update credential anchor record", 500);
    return Array.isArray(data) && data.length === 1;
  },
};

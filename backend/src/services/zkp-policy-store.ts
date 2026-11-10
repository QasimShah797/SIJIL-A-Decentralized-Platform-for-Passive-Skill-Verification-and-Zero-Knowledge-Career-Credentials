/**
 * Service-role store for automated ZKP policy verification outcomes.
 * Gracefully reports missing table as unavailable (503 / NOT_VERIFIED).
 * Never logs openings, disclosure tokens, scores, or counts.
 */
import { env } from "../config/env";
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { isMissingRelationError, isMissingColumnError } from "../utils/supabase-errors";
import type { CircuitVariant, ZkpOutcome } from "./zkp-policy";

export type ZkpPolicyType = "score-threshold-v1" | "github-contributions-v1";

export interface ZkpPolicyVerificationRow {
  id: string;
  learnerUserId: string;
  zkpType: ZkpPolicyType;
  policyVersion: string;
  threshold: number;
  outcome: ZkpOutcome;
  circuitVariant: CircuitVariant | null;
  evidenceRef: string;
  evidenceScope: Record<string, unknown>;
  evidenceFreshAt: string | null;
  publicSignals: unknown;
  proof: unknown;
  disclosureTokenHash: string | null;
  disclosureExpiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertZkpPolicyVerificationInput {
  learnerUserId: string;
  zkpType: ZkpPolicyType;
  policyVersion: string;
  threshold: number;
  outcome: ZkpOutcome;
  circuitVariant: CircuitVariant | null;
  evidenceRef: string;
  evidenceScope: Record<string, unknown>;
  evidenceFreshAt: string | null;
  publicSignals: unknown;
  proof: unknown;
  disclosureTokenHash: string | null;
  disclosureExpiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type ZkpPolicyStoreAvailability =
  | { available: true }
  | { available: false; reason: "missing_table" | "service_role" | "error"; message: string };

function requireServiceRole(): void {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_ANON_KEY) {
    throw new AppError("Trusted ZKP policy records are unavailable", 503);
  }
}

function mapRow(row: Record<string, unknown>): ZkpPolicyVerificationRow {
  return {
    id: String(row.id ?? ""),
    learnerUserId: String(row.learner_user_id ?? ""),
    zkpType: row.zkp_type as ZkpPolicyType,
    policyVersion: String(row.policy_version ?? ""),
    threshold: Number(row.threshold ?? 0),
    outcome: row.outcome as ZkpOutcome,
    circuitVariant: (row.circuit_variant as CircuitVariant | null) ?? null,
    evidenceRef: String(row.evidence_ref ?? ""),
    evidenceScope: (row.evidence_scope && typeof row.evidence_scope === "object"
      ? row.evidence_scope as Record<string, unknown>
      : {}),
    evidenceFreshAt: typeof row.evidence_fresh_at === "string" ? row.evidence_fresh_at : null,
    publicSignals: row.public_signals ?? null,
    proof: row.proof ?? null,
    disclosureTokenHash: typeof row.disclosure_token_hash === "string" ? row.disclosure_token_hash : null,
    disclosureExpiresAt: typeof row.disclosure_expires_at === "string" ? row.disclosure_expires_at : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function isUnavailableError(error: unknown): boolean {
  return isMissingRelationError(error) || isMissingColumnError(error);
}

/** Errors that need the learner (reconnect, connect) are not retried automatically. */
export function isRetryableErrorCode(code: string | null): boolean {
  return code !== "github_oauth_expired" && code !== "github_not_connected";
}

export interface ZkpPolicyStore {
  checkAvailability(): Promise<ZkpPolicyStoreAvailability>;
  upsert(input: UpsertZkpPolicyVerificationInput): Promise<ZkpPolicyVerificationRow>;
  getByEvidence(
    learnerUserId: string,
    zkpType: ZkpPolicyType,
    policyVersion: string,
    evidenceRef: string,
  ): Promise<ZkpPolicyVerificationRow | null>;
  listForLearner(learnerUserId: string): Promise<ZkpPolicyVerificationRow[]>;
  /** PENDING rows and retryable ERROR rows last touched before `updatedBefore` (ISO). */
  listRetryCandidates(limit: number, updatedBefore: string): Promise<ZkpPolicyVerificationRow[]>;
  listStaleGitHub(limit: number, freshBefore: string): Promise<ZkpPolicyVerificationRow[]>;
  getByDisclosureTokenHash(tokenHash: string): Promise<ZkpPolicyVerificationRow | null>;
}

export function createSupabaseZkpPolicyStore(): ZkpPolicyStore {
  const db = () => {
    requireServiceRole();
    return getServiceSupabase();
  };

  return {
    async checkAvailability() {
      try {
        requireServiceRole();
      } catch {
        return { available: false, reason: "service_role", message: "Trusted ZKP policy records are unavailable" };
      }
      const { error } = await db()
        .from("zkp_policy_verifications")
        .select("id")
        .limit(1);
      if (!error) return { available: true };
      if (isUnavailableError(error)) {
        return { available: false, reason: "missing_table", message: "ZKP policy table is not applied" };
      }
      return { available: false, reason: "error", message: "Trusted ZKP policy records are unavailable" };
    },

    async upsert(input) {
      const client = db();
      const { data: rpcData, error: rpcError } = await client.rpc("upsert_zkp_policy_verification", {
        p_learner_user_id: input.learnerUserId,
        p_zkp_type: input.zkpType,
        p_policy_version: input.policyVersion,
        p_threshold: input.threshold,
        p_outcome: input.outcome,
        p_circuit_variant: input.circuitVariant,
        p_evidence_ref: input.evidenceRef,
        p_evidence_scope: input.evidenceScope,
        p_evidence_fresh_at: input.evidenceFreshAt,
        p_public_signals: input.publicSignals,
        p_proof: input.proof,
        p_disclosure_token_hash: input.disclosureTokenHash,
        p_disclosure_expires_at: input.disclosureExpiresAt,
        p_error_code: input.errorCode,
        p_error_message: input.errorMessage,
      });

      if (!rpcError && rpcData) {
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        return mapRow(row as Record<string, unknown>);
      }

      // Fallback: direct upsert when RPC is missing (PGRST202 also says "schema cache") but table exists.
      const { data, error } = await client
        .from("zkp_policy_verifications")
        .upsert(
          {
            learner_user_id: input.learnerUserId,
            zkp_type: input.zkpType,
            policy_version: input.policyVersion,
            threshold: input.threshold,
            outcome: input.outcome,
            circuit_variant: input.circuitVariant,
            evidence_ref: input.evidenceRef,
            evidence_scope: input.evidenceScope,
            evidence_fresh_at: input.evidenceFreshAt,
            public_signals: input.publicSignals,
            proof: input.proof,
            disclosure_token_hash: input.disclosureTokenHash,
            disclosure_expires_at: input.disclosureExpiresAt,
            error_code: input.errorCode,
            error_message: input.errorMessage,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "learner_user_id,zkp_type,policy_version,evidence_ref" },
        )
        .select("*")
        .maybeSingle();

      if (error) {
        if (isUnavailableError(error)) throw new AppError("ZKP policy table is not applied", 503);
        throw new AppError("Could not store ZKP policy verification", 503);
      }
      if (!data) throw new AppError("Could not store ZKP policy verification", 503);
      return mapRow(data as Record<string, unknown>);
    },

    async getByEvidence(learnerUserId, zkpType, policyVersion, evidenceRef) {
      const { data, error } = await db()
        .from("zkp_policy_verifications")
        .select("*")
        .eq("learner_user_id", learnerUserId)
        .eq("zkp_type", zkpType)
        .eq("policy_version", policyVersion)
        .eq("evidence_ref", evidenceRef)
        .maybeSingle();
      if (error) {
        if (isUnavailableError(error)) return null;
        throw new AppError("Could not read ZKP policy verification", 503);
      }
      return data ? mapRow(data as Record<string, unknown>) : null;
    },

    async listForLearner(learnerUserId) {
      const { data, error } = await db()
        .from("zkp_policy_verifications")
        .select("*")
        .eq("learner_user_id", learnerUserId)
        .order("updated_at", { ascending: false });
      if (error) {
        if (isUnavailableError(error)) return [];
        throw new AppError("Could not list ZKP policy verifications", 503);
      }
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },

    async listRetryCandidates(limit, updatedBefore) {
      const { data, error } = await db()
        .from("zkp_policy_verifications")
        .select("*")
        .in("outcome", ["PENDING", "ERROR"])
        .lt("updated_at", updatedBefore)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (error) {
        if (isUnavailableError(error)) return [];
        throw new AppError("Could not list ZKP policy retries", 503);
      }
      return (data ?? [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => row.outcome === "PENDING" || isRetryableErrorCode(row.errorCode));
    },

    async listStaleGitHub(limit, freshBefore) {
      const { data, error } = await db()
        .from("zkp_policy_verifications")
        .select("*")
        .eq("zkp_type", "github-contributions-v1")
        .in("outcome", ["MEETS_THRESHOLD", "BELOW_THRESHOLD"])
        .lt("evidence_fresh_at", freshBefore)
        .order("evidence_fresh_at", { ascending: true })
        .limit(limit);
      if (error) {
        if (isUnavailableError(error)) return [];
        throw new AppError("Could not list stale GitHub policy rows", 503);
      }
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },

    async getByDisclosureTokenHash(tokenHash) {
      const { data, error } = await db()
        .from("zkp_policy_verifications")
        .select("*")
        .eq("disclosure_token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        if (isUnavailableError(error)) return null;
        throw new AppError("Could not read ZKP policy disclosure", 503);
      }
      return data ? mapRow(data as Record<string, unknown>) : null;
    },
  };
}

/** Public learner/recruiter view — never includes private values or proof openings. */
export function toPublicPolicyStatus(row: ZkpPolicyVerificationRow) {
  return {
    zkpType: row.zkpType,
    policyVersion: row.policyVersion,
    threshold: row.threshold,
    outcome: row.outcome,
    circuitVariant: row.circuitVariant,
    commitment: Array.isArray(row.publicSignals) && typeof row.publicSignals[1] === "string"
      ? row.publicSignals[1]
      : null,
    evidenceRef: row.evidenceRef,
    evidenceScope: row.evidenceScope,
    evidenceFreshAt: row.evidenceFreshAt,
    errorCode: row.errorCode,
    updatedAt: row.updatedAt,
    hasDisclosure: Boolean(row.disclosureTokenHash),
  };
}

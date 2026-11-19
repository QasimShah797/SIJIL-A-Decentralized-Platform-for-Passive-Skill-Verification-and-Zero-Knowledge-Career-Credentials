/**
 * Persistence for recruiter score requests.
 * Client roles have no access. The hosted migration is not applied from here.
 */
import { randomUUID } from "node:crypto";
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";
import { AppError } from "../utils/AppError";

export type ScoreRequestStatus = "open" | "declined" | "consumed" | "expired";

export interface ScoreRequestRecord {
  id: string;
  recruiterUserId: string;
  learnerUserId: string;
  credentialUri: string;
  credentialId: string;
  threshold: number;
  status: ScoreRequestStatus;
  audience: string;
  shareTokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  proof: unknown;
  publicSignals: unknown;
}

export interface ScoreRequestStore {
  checkAvailability(): Promise<{ available: true } | { available: false; reason: "missing_table" | "error" }>;
  insert(input: Omit<ScoreRequestRecord, "id" | "status" | "consumedAt" | "createdAt" | "proof" | "publicSignals">): Promise<ScoreRequestRecord>;
  getById(id: string): Promise<ScoreRequestRecord | null>;
  listForLearner(learnerUserId: string): Promise<ScoreRequestRecord[]>;
  listForRecruiter(recruiterUserId: string): Promise<ScoreRequestRecord[]>;
  listForCredential(credentialUri: string): Promise<ScoreRequestRecord[]>;
  decline(id: string, learnerUserId: string, now: number): Promise<ScoreRequestRecord | null>;
  consume(input: {
    id: string;
    learnerUserId: string;
    now: number;
    proof: unknown;
    publicSignals: unknown;
  }): Promise<"consumed" | "expired" | "not_open" | "missing">;
}

function mapRow(row: Record<string, unknown>): ScoreRequestRecord {
  return {
    id: String(row.id),
    recruiterUserId: String(row.recruiter_user_id),
    learnerUserId: String(row.learner_user_id),
    credentialUri: String(row.credential_uri),
    credentialId: String(row.credential_id),
    threshold: Number(row.threshold),
    status: row.status as ScoreRequestStatus,
    audience: String(row.audience),
    shareTokenHash: String(row.share_token_hash),
    expiresAt: String(row.expires_at),
    consumedAt: typeof row.consumed_at === "string" ? row.consumed_at : null,
    createdAt: String(row.created_at),
    proof: row.proof ?? null,
    publicSignals: row.public_signals ?? null,
  };
}

export function createMemoryScoreRequestStore(): ScoreRequestStore {
  const rows: ScoreRequestRecord[] = [];
  return {
    async checkAvailability() {
      return { available: true };
    },
    async insert(input) {
      const row: ScoreRequestRecord = {
        ...input,
        id: randomUUID(),
        status: "open",
        consumedAt: null,
        createdAt: new Date().toISOString(),
        proof: null,
        publicSignals: null,
      };
      rows.push(row);
      return row;
    },
    async getById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async listForLearner(learnerUserId) {
      return rows.filter((row) => row.learnerUserId === learnerUserId);
    },
    async listForRecruiter(recruiterUserId) {
      return rows.filter((row) => row.recruiterUserId === recruiterUserId);
    },
    async listForCredential(credentialUri) {
      return rows.filter((row) => row.credentialUri === credentialUri);
    },
    async decline(id, learnerUserId, now) {
      const row = rows.find((item) => item.id === id && item.learnerUserId === learnerUserId);
      if (!row || row.status !== "open") return null;
      if (Date.parse(row.expiresAt) <= now) {
        row.status = "expired";
        return row;
      }
      row.status = "declined";
      return row;
    },
    async consume(input) {
      const row = rows.find((item) => item.id === input.id);
      if (!row) return "missing";
      if (row.learnerUserId !== input.learnerUserId) return "missing";
      if (row.status !== "open") return "not_open";
      if (Date.parse(row.expiresAt) <= input.now) {
        row.status = "expired";
        return "expired";
      }
      row.status = "consumed";
      row.consumedAt = new Date(input.now).toISOString();
      row.proof = input.proof;
      row.publicSignals = input.publicSignals;
      return "consumed";
    },
  };
}

function db() {
  return supabaseService.client;
}

export function createSupabaseScoreRequestStore(): ScoreRequestStore {
  return {
    async checkAvailability() {
      const { error } = await db().from("zkp_score_verification_requests").select("id").limit(1);
      if (!error) return { available: true };
      if (isMissingRelationError(error)) return { available: false, reason: "missing_table" };
      return { available: false, reason: "error" };
    },
    async insert(input) {
      const { data, error } = await db().from("zkp_score_verification_requests").insert({
        recruiter_user_id: input.recruiterUserId,
        learner_user_id: input.learnerUserId,
        credential_uri: input.credentialUri,
        credential_id: input.credentialId,
        threshold: input.threshold,
        status: "open",
        audience: input.audience,
        share_token_hash: input.shareTokenHash,
        expires_at: input.expiresAt,
      }).select("*").single();
      if (error || !data) {
        if (isMissingRelationError(error)) {
          throw new AppError("Score verification requests are not available until the local table is applied.", 503);
        }
        throw new AppError("Could not save the verification request", 503);
      }
      return mapRow(data as Record<string, unknown>);
    },
    async getById(id) {
      const { data, error } = await db().from("zkp_score_verification_requests").select("*").eq("id", id).maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw new AppError("Could not read the verification request", 503);
      }
      return data ? mapRow(data as Record<string, unknown>) : null;
    },
    async listForLearner(learnerUserId) {
      const { data, error } = await db().from("zkp_score_verification_requests").select("*").eq("learner_user_id", learnerUserId).order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw new AppError("Could not list verification requests", 503);
      }
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
    async listForRecruiter(recruiterUserId) {
      const { data, error } = await db().from("zkp_score_verification_requests").select("*").eq("recruiter_user_id", recruiterUserId).order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw new AppError("Could not list verification requests", 503);
      }
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
    async listForCredential(credentialUri) {
      const { data, error } = await db().from("zkp_score_verification_requests").select("*").eq("credential_uri", credentialUri);
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw new AppError("Could not list verification requests", 503);
      }
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
    async decline(id, learnerUserId, now) {
      const existing = await this.getById(id);
      if (!existing || existing.learnerUserId !== learnerUserId || existing.status !== "open") return null;
      const nextStatus = Date.parse(existing.expiresAt) <= now ? "expired" : "declined";
      const { data, error } = await db().from("zkp_score_verification_requests").update({
        status: nextStatus,
        updated_at: new Date(now).toISOString(),
      }).eq("id", id).eq("learner_user_id", learnerUserId).eq("status", "open").select("*").maybeSingle();
      if (error || !data) return null;
      return mapRow(data as Record<string, unknown>);
    },
    async consume(input) {
      const consumedAt = new Date(input.now).toISOString();
      const { data, error } = await db().from("zkp_score_verification_requests").update({
        status: "consumed",
        consumed_at: consumedAt,
        proof: input.proof,
        public_signals: input.publicSignals,
        updated_at: consumedAt,
      }).eq("id", input.id).eq("learner_user_id", input.learnerUserId).eq("status", "open").gt("expires_at", consumedAt).select("id");
      if (error) {
        if (isMissingRelationError(error)) return "missing";
        throw new AppError("Could not accept the verification request", 503);
      }
      if (data && data.length > 0) return "consumed";
      const current = await this.getById(input.id);
      if (!current || current.learnerUserId !== input.learnerUserId) return "missing";
      if (current.status !== "open") return "not_open";
      return "expired";
    },
  };
}

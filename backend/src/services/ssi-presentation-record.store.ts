/**
 * Durable learner-signed Verifiable Presentation records.
 * Uses the live `ssi_verifiable_presentations` table (no full envelope column):
 * claims come from the linked challenge; credentials are reloaded by id; proof_value is stored.
 * Revocation uses nullable `revoked_at` (additive migration; absent column → 503 on revoke).
 */
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError, isUniqueViolation } from "../utils/supabase-errors";
import { supabaseService } from "./supabase.service";
import { canonicalPresentationPayload } from "./ssi-presentation-protocol";
import type { PresentationSigningClaims } from "./ssi-presentation-protocol";

export const SSI_VP_TABLE = "ssi_verifiable_presentations";

export type PresentationRecordRow = {
  id: string;
  challengeId: string;
  learnerUserId: string;
  holderDid: string;
  credentialIds: string[];
  presentationHash: string;
  proofValue: string;
  createdAt: string;
  revokedAt: string | null;
};

export interface PresentationRecordStore {
  insert(input: {
    id?: string;
    challengeId: string;
    learnerUserId: string;
    holderDid: string;
    credentialIds: string[];
    claims: PresentationSigningClaims;
    proofValue: string;
  }): Promise<PresentationRecordRow>;
  getById(id: string): Promise<PresentationRecordRow | null>;
  deleteById(id: string): Promise<void>;
  /** Sets revoked_at for the owning learner. Idempotent if already revoked by that owner. */
  revokeForOwner(id: string, learnerUserId: string, at: string): Promise<PresentationRecordRow>;
}

export function presentationHashFromClaims(claims: PresentationSigningClaims): string {
  return createHash("sha256").update(canonicalPresentationPayload(claims), "utf8").digest("hex");
}

export class MemoryPresentationRecordStore implements PresentationRecordStore {
  private readonly rows = new Map<string, PresentationRecordRow>();

  async insert(input: {
    id?: string;
    challengeId: string;
    learnerUserId: string;
    holderDid: string;
    credentialIds: string[];
    claims: PresentationSigningClaims;
    proofValue: string;
  }): Promise<PresentationRecordRow> {
    for (const row of this.rows.values()) {
      if (row.challengeId === input.challengeId) {
        throw new AppError("Presentation challenge has already been used", 409);
      }
    }
    const createdAt = new Date().toISOString();
    const record: PresentationRecordRow = {
      id: input.id ?? randomUUID(),
      challengeId: input.challengeId,
      learnerUserId: input.learnerUserId,
      holderDid: input.holderDid,
      credentialIds: [...input.credentialIds],
      presentationHash: presentationHashFromClaims(input.claims),
      proofValue: input.proofValue,
      createdAt,
      revokedAt: null,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<PresentationRecordRow | null> {
    const row = this.rows.get(id);
    return row ? { ...row, credentialIds: [...row.credentialIds] } : null;
  }

  async deleteById(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async revokeForOwner(id: string, learnerUserId: string, at: string): Promise<PresentationRecordRow> {
    const row = this.rows.get(id);
    if (!row) throw new AppError("Presentation not found", 404);
    if (row.learnerUserId !== learnerUserId) {
      throw new AppError("Not authorized to revoke this presentation", 403);
    }
    if (row.revokedAt) return { ...row, credentialIds: [...row.credentialIds] };
    const next = { ...row, revokedAt: at, credentialIds: [...row.credentialIds] };
    this.rows.set(id, next);
    return next;
  }

  /** Test helper: drop all rows to simulate a process restart. */
  clear(): void {
    this.rows.clear();
  }
}

type VpQuery = {
  eq: (column: string, value: string) => VpQuery;
  is: (column: string, value: null) => VpQuery;
  select: (columns: string) => {
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
    single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
  };
};

type VpDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
      };
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => VpQuery;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string; code?: string } | null }>;
    };
  };
};

function mapRow(row: Record<string, unknown>): PresentationRecordRow {
  const ids = Array.isArray(row.credential_ids) ? row.credential_ids.map(String) : [];
  return {
    id: String(row.id),
    challengeId: String(row.challenge_id),
    learnerUserId: String(row.learner_user_id),
    holderDid: String(row.holder_did),
    credentialIds: ids,
    presentationHash: String(row.presentation_hash),
    proofValue: String(row.proof_value),
    createdAt: String(row.created_at),
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
  };
}

function revokeSchemaUnavailable(error: unknown): boolean {
  return isMissingColumnError(error) || /revoked_at/i.test(String((error as { message?: string })?.message ?? error));
}

export class SupabasePresentationRecordStore implements PresentationRecordStore {
  constructor(private readonly db: VpDb = supabaseService.client as unknown as VpDb) {}

  async insert(input: {
    id?: string;
    challengeId: string;
    learnerUserId: string;
    holderDid: string;
    credentialIds: string[];
    claims: PresentationSigningClaims;
    proofValue: string;
  }): Promise<PresentationRecordRow> {
    const { data, error } = await this.db
      .from(SSI_VP_TABLE)
      .insert({
        id: input.id ?? randomUUID(),
        challenge_id: input.challengeId,
        learner_user_id: input.learnerUserId,
        holder_did: input.holderDid,
        credential_ids: input.credentialIds,
        presentation_hash: presentationHashFromClaims(input.claims),
        proof_value: input.proofValue,
      })
      .select("*")
      .single();
    if (error) {
      if (isMissingRelationError(error)) {
        throw new AppError("Verifiable presentation table is unavailable; nothing was stored", 503);
      }
      if (isUniqueViolation(error)) {
        throw new AppError("Presentation challenge has already been used", 409);
      }
      throw new AppError("Could not persist verifiable presentation", 503);
    }
    if (!data) throw new AppError("Could not persist verifiable presentation", 503);
    return mapRow(data);
  }

  async getById(id: string): Promise<PresentationRecordRow | null> {
    const { data, error } = await this.db.from(SSI_VP_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        throw new AppError("Verifiable presentation table is unavailable", 503);
      }
      throw new AppError("Could not load verifiable presentation", 503);
    }
    return data ? mapRow(data) : null;
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.db.from(SSI_VP_TABLE).delete().eq("id", id);
    if (error && !isMissingRelationError(error)) {
      throw new AppError("Could not roll back verifiable presentation", 503);
    }
  }

  async revokeForOwner(id: string, learnerUserId: string, at: string): Promise<PresentationRecordRow> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError("Presentation not found", 404);
    if (existing.learnerUserId !== learnerUserId) {
      throw new AppError("Not authorized to revoke this presentation", 403);
    }
    if (existing.revokedAt) return existing;

    const { data, error } = await this.db
      .from(SSI_VP_TABLE)
      .update({ revoked_at: at })
      .eq("id", id)
      .eq("learner_user_id", learnerUserId)
      .is("revoked_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error) || revokeSchemaUnavailable(error)) {
        throw new AppError("Presentation revocation is not available yet", 503);
      }
      throw new AppError("Could not revoke presentation", 503);
    }
    if (data) return mapRow(data);

    // Race: another request revoked first — idempotent success.
    const again = await this.getById(id);
    if (again?.learnerUserId === learnerUserId && again.revokedAt) return again;
    throw new AppError("Could not revoke presentation", 503);
  }
}

export const supabasePresentationRecordStore = new SupabasePresentationRecordStore();

/**
 * Service-role access to GitHub contribution ZKP records.
 * Callers must not return openings to browsers or recruiters.
 */
import { env } from "../config/env";
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";

const MAX_U32 = 4294967295;

function requireServiceRole(): void {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_ANON_KEY) {
    throw new AppError("Trusted GitHub proof records are unavailable", 503);
  }
}

export interface PublicGitHubSnapshot {
  snapshotId: string;
  learnerId: string;
  githubUsername: string;
  repositoryFullName: string;
  verifiedAt: string;
  commitment: string;
}

export interface GitHubOpening {
  snapshotId: string;
  learnerId: string;
  contributionCount: number;
  blinding: string;
}

export interface StoredGitHubProof {
  proofId: string;
  snapshotId: string;
  learnerId: string;
  threshold: number;
  commitment: string;
  proof: unknown;
  repositoryFullName: string;
  githubUsername: string;
  verifiedAt: string;
  createdAt: string;
}

export interface StoredGitHubDisclosure {
  disclosureId: string;
  proofId: string;
  learnerId: string;
  expiresAt: string;
  proof: StoredGitHubProof;
}

export interface GitHubZkpStore {
  githubConnected(learnerId: string): Promise<{ connected: boolean; username: string | null }>;
  listSnapshots(learnerId: string): Promise<PublicGitHubSnapshot[]>;
  getSnapshot(snapshotId: string, learnerId: string): Promise<PublicGitHubSnapshot | null>;
  getOpening(snapshotId: string, learnerId: string): Promise<GitHubOpening | null>;
  findProof(snapshotId: string, learnerId: string, threshold: number): Promise<StoredGitHubProof | null>;
  getProof(proofId: string, learnerId: string): Promise<StoredGitHubProof | null>;
  insertProof(input: {
    proofId: string;
    snapshotId: string;
    learnerId: string;
    threshold: number;
    proof: unknown;
    commitment: string;
  }): Promise<"created" | "exists">;
  insertDisclosure(input: {
    disclosureId: string;
    proofId: string;
    learnerId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  getDisclosureByTokenHash(tokenHash: string): Promise<StoredGitHubDisclosure | null>;
}

function unavailable(): never {
  throw new AppError("Trusted GitHub proof records are unavailable", 503);
}

function readCount(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^[0-9]+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_U32) {
    throw new AppError("Trusted GitHub proof records are invalid", 500);
  }
  return parsed;
}

function readSnapshot(row: Record<string, unknown>): PublicGitHubSnapshot {
  if (
    typeof row.id !== "string"
    || typeof row.learner_user_id !== "string"
    || typeof row.github_username !== "string"
    || typeof row.repository_full_name !== "string"
    || typeof row.verified_at !== "string"
    || typeof row.commitment !== "string"
  ) {
    throw new AppError("Trusted GitHub proof records are invalid", 500);
  }
  return {
    snapshotId: row.id,
    learnerId: row.learner_user_id,
    githubUsername: row.github_username,
    repositoryFullName: row.repository_full_name,
    verifiedAt: row.verified_at,
    commitment: row.commitment,
  };
}

function embeddedSnapshot(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    throw new AppError("Trusted GitHub proof records are invalid", 500);
  }
  return row as Record<string, unknown>;
}

function readProof(
  row: Record<string, unknown>,
  snapshot: { repository_full_name?: unknown; github_username?: unknown; verified_at?: unknown; commitment?: unknown },
): StoredGitHubProof {
  if (
    typeof row.id !== "string"
    || typeof row.snapshot_id !== "string"
    || typeof row.learner_user_id !== "string"
    || typeof row.public_commitment !== "string"
    || typeof row.created_at !== "string"
    || typeof snapshot.repository_full_name !== "string"
    || typeof snapshot.github_username !== "string"
    || typeof snapshot.verified_at !== "string"
    || snapshot.commitment !== row.public_commitment
  ) {
    throw new AppError("Trusted GitHub proof records are invalid", 500);
  }
  return {
    proofId: row.id,
    snapshotId: row.snapshot_id,
    learnerId: row.learner_user_id,
    threshold: readCount(row.threshold),
    commitment: row.public_commitment,
    proof: row.proof,
    repositoryFullName: snapshot.repository_full_name,
    githubUsername: snapshot.github_username,
    verifiedAt: snapshot.verified_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseGitHubZkpStore(): GitHubZkpStore {
  const db = () => {
    requireServiceRole();
    return getServiceSupabase();
  };

  return {
    async githubConnected(learnerId) {
      const { data, error } = await db()
        .from("github_connections")
        .select("github_username")
        .eq("user_id", learnerId)
        .maybeSingle();
      if (error) unavailable();
      const username = data && typeof data.github_username === "string" ? data.github_username : null;
      return { connected: Boolean(username), username };
    },

    async listSnapshots(learnerId) {
      const { data, error } = await db()
        .from("github_contribution_snapshots")
        .select("id, learner_user_id, github_username, repository_full_name, verified_at, commitment")
        .eq("learner_user_id", learnerId)
        .order("verified_at", { ascending: false });
      if (error || !data) unavailable();
      return data.map((row) => readSnapshot(row as Record<string, unknown>));
    },

    async getSnapshot(snapshotId, learnerId) {
      const { data, error } = await db()
        .from("github_contribution_snapshots")
        .select("id, learner_user_id, github_username, repository_full_name, verified_at, commitment")
        .eq("id", snapshotId)
        .eq("learner_user_id", learnerId)
        .maybeSingle();
      if (error) unavailable();
      return data ? readSnapshot(data as Record<string, unknown>) : null;
    },

    async getOpening(snapshotId, learnerId) {
      const { data, error } = await db()
        .from("github_contribution_openings")
        .select("snapshot_id, learner_user_id, contribution_count, blinding")
        .eq("snapshot_id", snapshotId)
        .eq("learner_user_id", learnerId)
        .maybeSingle();
      if (error) unavailable();
      if (!data) return null;
      if (
        typeof data.snapshot_id !== "string"
        || typeof data.learner_user_id !== "string"
        || typeof data.blinding !== "string"
      ) {
        throw new AppError("Trusted GitHub proof records are invalid", 500);
      }
      return {
        snapshotId: data.snapshot_id,
        learnerId: data.learner_user_id,
        contributionCount: readCount(data.contribution_count),
        blinding: data.blinding,
      };
    },

    async findProof(snapshotId, learnerId, threshold) {
      const { data, error } = await db()
        .from("github_contribution_proofs")
        .select("id, snapshot_id, learner_user_id, threshold, public_commitment, proof, created_at, github_contribution_snapshots!inner(repository_full_name, github_username, verified_at, commitment)")
        .eq("snapshot_id", snapshotId)
        .eq("learner_user_id", learnerId)
        .eq("threshold", threshold)
        .maybeSingle();
      if (error) unavailable();
      if (!data) return null;
      return readProof(data as unknown as Record<string, unknown>, embeddedSnapshot(data.github_contribution_snapshots));
    },

    async getProof(proofId, learnerId) {
      const { data, error } = await db()
        .from("github_contribution_proofs")
        .select("id, snapshot_id, learner_user_id, threshold, public_commitment, proof, created_at, github_contribution_snapshots!inner(repository_full_name, github_username, verified_at, commitment)")
        .eq("id", proofId)
        .eq("learner_user_id", learnerId)
        .maybeSingle();
      if (error) unavailable();
      if (!data) return null;
      return readProof(data as unknown as Record<string, unknown>, embeddedSnapshot(data.github_contribution_snapshots));
    },

    async insertProof(input) {
      const { error } = await db().rpc("create_github_contribution_proof", {
        p_proof_id: input.proofId,
        p_snapshot_id: input.snapshotId,
        p_learner_user_id: input.learnerId,
        p_threshold: input.threshold,
        p_proof: input.proof,
        p_public_threshold: String(input.threshold),
        p_public_commitment: input.commitment,
      });
      if (!error) return "created";
      if (error.code === "23505") return "exists";
      unavailable();
    },

    async insertDisclosure(input) {
      const { error } = await db().rpc("create_github_contribution_disclosure", {
        p_disclosure_id: input.disclosureId,
        p_proof_id: input.proofId,
        p_learner_user_id: input.learnerId,
        p_token_hash: input.tokenHash,
        p_expires_at: input.expiresAt,
      });
      if (error) unavailable();
    },

    async getDisclosureByTokenHash(tokenHash) {
      const { data, error } = await db()
        .from("github_contribution_disclosures")
        .select("id, proof_id, learner_user_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) unavailable();
      if (!data || typeof data.proof_id !== "string" || typeof data.learner_user_id !== "string" || typeof data.expires_at !== "string" || typeof data.id !== "string") {
        return null;
      }
      const proof = await this.getProof(data.proof_id, data.learner_user_id);
      if (!proof) return null;
      return {
        disclosureId: data.id,
        proofId: data.proof_id,
        learnerId: data.learner_user_id,
        expiresAt: data.expires_at,
        proof,
      };
    },
  };
}

/**
 * Load credentials, revoke via outbox, and run public ledger verification.
 */
import { z } from "zod";
import { AppError } from "../utils/AppError";
import { supabaseService } from "./supabase.service";
import { getEvaluateLedgerService } from "./ledger.factory";
import { canRevokeIssuedCredential } from "./credential-revoke-auth";
import type { AuthCaller } from "./learner-access";
import { verifyCredentialHash } from "./signing.service";
import {
  evaluateCredentialVerification,
  type CredentialVerifyResult,
  type CredentialVerifySnapshot,
} from "./credential-verify";
import type { CredentialRow } from "../types/credentials.types";
import {
  computeLiveEvidenceIntegrity,
  EVIDENCE_DOWNLOAD_TIMEOUT_MS,
  SKILL_EVIDENCE_BUCKET,
  evidenceFileTooLarge,
} from "../utils/evidence-hash";
import { publicVerifyCache, shouldCacheVerifyResult } from "./verify-cache";

const uuidSchema = z.string().uuid();

export interface RevokeCredentialResult {
  id: string;
  revokedAt: string;
  revokeStatus: string;
}

function proofValueFromRow(proof: unknown): string | null {
  if (!proof || typeof proof !== "object") return null;
  const value = (proof as Record<string, unknown>).proofValue;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asCredentialRow(data: Record<string, unknown>): CredentialRow {
  return data as unknown as CredentialRow;
}

export async function loadCredentialByIdOrUri(idOrUri: string): Promise<CredentialRow | null> {
  const client = supabaseService.client;
  const byUuid = uuidSchema.safeParse(idOrUri);
  const primary = byUuid.success
    ? await client.from("credentials").select("*").eq("id", idOrUri).maybeSingle()
    : await client.from("credentials").select("*").eq("credential_uri", idOrUri).maybeSingle();

  if (primary.error) throw new AppError(primary.error.message, 500);
  if (primary.data) return asCredentialRow(primary.data as Record<string, unknown>);
  if (!byUuid.success) return null;

  const byUri = await client.from("credentials").select("*").eq("credential_uri", idOrUri).maybeSingle();
  if (byUri.error) throw new AppError(byUri.error.message, 500);
  if (byUri.data) return asCredentialRow(byUri.data as Record<string, unknown>);
  return null;
}

export function snapshotFromRow(
  row: CredentialRow,
  evidence?: {
    storedHashes: string[] | null;
    liveHashes: string[];
    mismatch: boolean;
    unavailable?: boolean;
    legacy?: boolean;
  },
): CredentialVerifySnapshot {
  return {
    found: true,
    credentialId: row.id,
    storedHash: row.credential_hash ?? null,
    storedDocument: row.credential_document ?? null,
    proofValue: proofValueFromRow(row.proof),
    revokedAt: row.revoked_at ?? null,
    anchorStatus: row.anchor_status ?? "pending",
    anchorTxId: row.anchor_tx_id ?? null,
    anchoredAt: row.anchored_at ?? null,
    storedEvidenceHashes: evidence?.storedHashes,
    liveEvidenceHashes: evidence?.liveHashes,
    evidenceHashMismatch: evidence?.mismatch,
    evidenceUnavailable: evidence?.unavailable,
    legacyUnverifiedEvidence: evidence?.legacy,
    holderDid: row.holder_did,
    issuerDid: row.issuer_did,
    revokeStatus: row.revoke_status ?? null,
    zkpApplicable: hasAssessmentCommitment(row.credential_document),
  };
}

function hasAssessmentCommitment(document: unknown): boolean {
  if (!document || typeof document !== "object") return false;
  const subject = (document as { credentialSubject?: { assessmentCommitment?: unknown } }).credentialSubject;
  return Boolean(subject?.assessmentCommitment);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("evidence download timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function downloadSkillEvidenceObject(path: string): Promise<Buffer | "unavailable" | null> {
  try {
    const { data, error } = await withTimeout(
      supabaseService.client.storage.from(SKILL_EVIDENCE_BUCKET).download(path),
      EVIDENCE_DOWNLOAD_TIMEOUT_MS,
    );
    if (error || !data) return "unavailable";
    const buffer = Buffer.from(await withTimeout(data.arrayBuffer(), EVIDENCE_DOWNLOAD_TIMEOUT_MS));
    if (evidenceFileTooLarge(buffer)) {
      return "unavailable";
    }
    return buffer;
  } catch {
    return "unavailable";
  }
}

async function loadEvidenceIntegrity(row: CredentialRow): Promise<{
  storedHashes: string[] | null;
  liveHashes: string[];
  mismatch: boolean;
  unavailable: boolean;
  legacy: boolean;
}> {
  const skillName = row.skill_name;
  if (!skillName) {
    return computeLiveEvidenceIntegrity([], row.credential_document, downloadSkillEvidenceObject);
  }

  const { data: skill } = await supabaseService.client
    .from("declared_skills")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("name", skillName)
    .maybeSingle();

  const skillId = typeof skill?.id === "string" ? skill.id : null;
  let query = supabaseService.client
    .from("supporting_records")
    .select("content_hash, source, title, url")
    .eq("user_id", row.user_id);
  if (skillId) query = query.eq("skill_id", skillId);

  const { data: records } = await query;
  return computeLiveEvidenceIntegrity(
    (records ?? []).map((item) => ({
      content_hash: typeof item.content_hash === "string" ? item.content_hash : null,
      source: typeof item.source === "string" ? item.source : "",
      title: typeof item.title === "string" ? item.title : "",
      url: typeof item.url === "string" ? item.url : null,
    })),
    row.credential_document,
    downloadSkillEvidenceObject,
  );
}

export async function verifyPublicCredential(idOrUri: string): Promise<CredentialVerifyResult> {
  const row = await loadCredentialByIdOrUri(idOrUri);
  if (!row) {
    const missing = await evaluateCredentialVerification(null, {
      verifySignature: () => false,
      ledger: getEvaluateLedgerService(),
    });
    if (shouldCacheVerifyResult(missing.status)) {
      publicVerifyCache.set(idOrUri, null, missing);
    }
    return missing;
  }

  const cached = publicVerifyCache.get(row.id, row.credential_hash);
  if (cached) return cached;

  const evidence = await loadEvidenceIntegrity(row);
  const result = await evaluateCredentialVerification(snapshotFromRow(row, evidence), {
    verifySignature: (hashHex, proofValue) => {
      try {
        return verifyCredentialHash(hashHex, proofValue);
      } catch {
        return false;
      }
    },
    ledger: getEvaluateLedgerService(),
  });
  if (shouldCacheVerifyResult(result.status)) {
    publicVerifyCache.set(row.id, row.credential_hash, result);
  }
  return result;
}

export async function revokeIssuedCredential(
  idOrUri: string,
  reason: string,
  caller: AuthCaller,
): Promise<RevokeCredentialResult> {
  const row = await loadCredentialByIdOrUri(idOrUri);
  if (!row) throw new AppError("Credential not found", 404);
  if (!canRevokeIssuedCredential(caller, row.user_id)) {
    throw new AppError("Only the credential holder or an administrator can revoke this credential", 403);
  }

  const now = new Date().toISOString();
  const alreadyRevoked = Boolean(row.revoked_at);
  const { data, error } = await supabaseService.client
    .from("credentials")
    .update({
      revoked_at: row.revoked_at ?? now,
      revocation_reason: reason,
      revoke_status: row.revoke_status === "revoked" ? "revoked" : "pending",
      revoke_attempts: row.revoke_status === "revoked" ? row.revoke_attempts ?? 0 : 0,
      revoke_last_error: null,
      updated_at: now,
    })
    .eq("id", row.id)
    .select("id, revoked_at, revoke_status")
    .single();

  if (error) throw new AppError(error.message, 500);
  publicVerifyCache.invalidateCredential(row.id);

  return {
    id: String((data as Record<string, unknown>).id ?? row.id),
    revokedAt: String((data as Record<string, unknown>).revoked_at ?? now),
    revokeStatus: alreadyRevoked && row.revoke_status === "revoked"
      ? "revoked"
      : String((data as Record<string, unknown>).revoke_status ?? "pending"),
  };
}

export async function findCredentialForLearnerCompetency(
  learnerId: string,
  competencyId: string,
): Promise<CredentialRow | null> {
  const { data: skill, error: skillErr } = await supabaseService.client
    .from("declared_skills")
    .select("id, name")
    .eq("id", competencyId)
    .eq("user_id", learnerId)
    .maybeSingle();

  if (skillErr) throw new AppError(skillErr.message, 500);
  const skillName = typeof skill?.name === "string" ? skill.name : null;
  if (!skillName) return null;

  const { data, error } = await supabaseService.client
    .from("credentials")
    .select("*")
    .eq("user_id", learnerId)
    .eq("skill_name", skillName)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!data) return null;
  return asCredentialRow(data as Record<string, unknown>);
}

export async function isIssuedCredentialRevoked(
  learnerId: string,
  competencyId: string,
): Promise<boolean> {
  const row = await findCredentialForLearnerCompetency(learnerId, competencyId);
  if (!row) return false;
  if (row.revoked_at) return true;

  const ledger = getEvaluateLedgerService();
  if (!ledger.isEnabled() || !row.credential_hash) return Boolean(row.revoke_status === "pending");
  try {
    const result = await ledger.verifyCredential(row.id, row.credential_hash);
    return result.exists && result.status === "revoked";
  } catch {
    return false;
  }
}

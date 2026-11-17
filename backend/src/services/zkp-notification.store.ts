/**
 * Service-role persistence for verification notifications.
 * Client roles can read their own rows through RLS. They cannot write them.
 * A missing table does not change the practical-score proof result.
 */
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";
import { resolveLearnerDisplayName } from "../utils/learnerDisplayName";
import {
  VerificationNotificationWorkflow,
  createMemoryVerificationDirectory,
  type VerificationDirectory,
  type VerificationNotificationRecord,
  type VerificationRequestRecord,
  type VerificationStatus,
} from "./zkp-notification";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function mapRequest(row: Row): VerificationRequestRecord {
  return {
    id: String(row.id),
    legacyScoreRequestId: typeof row.legacy_score_request_id === "string" ? row.legacy_score_request_id : null,
    recruiterUserId: String(row.recruiter_user_id),
    learnerUserId: String(row.learner_user_id),
    recruiterLabel: text(row.recruiter_label, "A SIJIL recruiter"),
    learnerLabel: text(row.learner_label, "The learner"),
    category: row.category as VerificationRequestRecord["category"],
    skillLabel: text(row.skill_label, "this skill"),
    policyLabel: text(row.policy_label, "the requested policy"),
    threshold: typeof row.threshold === "number" ? row.threshold : null,
    status: row.status as VerificationStatus,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

function mapNotification(row: Row): VerificationNotificationRecord {
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    requestId: String(row.request_id),
    audience: row.audience as VerificationNotificationRecord["audience"],
    kind: row.kind as VerificationNotificationRecord["kind"],
    title: String(row.title),
    body: String(row.body),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at),
  };
}

function db() {
  return supabaseService.client;
}

export function createSupabaseVerificationDirectory(): VerificationDirectory {
  return {
    async findByLegacy(legacyScoreRequestId) {
      const { data, error } = await db().from("zkp_verification_requests").select("*").eq("legacy_score_request_id", legacyScoreRequestId).maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }
      return data ? mapRequest(data as Row) : null;
    },
    async findById(id) {
      const { data, error } = await db().from("zkp_verification_requests").select("*").eq("id", id).maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }
      return data ? mapRequest(data as Row) : null;
    },
    async insertRequest(row) {
      const { data, error } = await db().from("zkp_verification_requests").insert({
        id: row.id,
        legacy_score_request_id: row.legacyScoreRequestId,
        recruiter_user_id: row.recruiterUserId,
        learner_user_id: row.learnerUserId,
        recruiter_label: row.recruiterLabel,
        learner_label: row.learnerLabel,
        category: row.category,
        skill_label: row.skillLabel,
        policy_label: row.policyLabel,
        ...(typeof row.threshold === "number" ? { threshold: row.threshold } : {}),
        status: row.status,
        expires_at: row.expiresAt,
        created_at: row.createdAt,
      }).select("*").single();
      if (error || !data) throw error ?? new Error("request was not saved");
      return mapRequest(data as Row);
    },
    async updateStatus(id, status) {
      const { data, error } = await db().from("zkp_verification_requests").update({
        status,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }
      const mapped = data ? mapRequest(data as Row) : null;
      if (mapped?.legacyScoreRequestId && status === "expired") {
        await db()
          .from("zkp_score_verification_requests")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", mapped.legacyScoreRequestId)
          .eq("status", "open");
      }
      return mapped;
    },
    async claimStatus(id, from, status) {
      const { data, error } = await db().from("zkp_verification_requests").update({
        status,
        updated_at: new Date().toISOString(),
      }).eq("id", id).in("status", from).select("*").maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }
      return data ? mapRequest(data as Row) : null;
    },
    async listForLearner(learnerUserId) {
      const { data, error } = await db().from("zkp_verification_requests").select("*").eq("learner_user_id", learnerUserId).order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw error;
      }
      return (data ?? []).map((row) => mapRequest(row as Row));
    },
    async listForRecruiter(recruiterUserId) {
      const { data, error } = await db().from("zkp_verification_requests").select("*").eq("recruiter_user_id", recruiterUserId).order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw error;
      }
      return (data ?? []).map((row) => mapRequest(row as Row));
    },
    async insertNotification(row) {
      const { error } = await db().from("zkp_notifications").insert({
        id: row.id,
        recipient_user_id: row.recipientUserId,
        request_id: row.requestId,
        audience: row.audience,
        kind: row.kind,
        title: row.title,
        body: row.body,
        created_at: row.createdAt,
      });
      if (!error) return "created";
      if (error.code === "23505") return "duplicate";
      if (isMissingRelationError(error)) return "duplicate";
      throw error;
    },
    async listNotifications(recipientUserId) {
      const { data, error } = await db().from("zkp_notifications").select("*").eq("recipient_user_id", recipientUserId).order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) return [];
        throw error;
      }
      return (data ?? []).map((row) => mapNotification(row as Row));
    },
    async markRead(id, recipientUserId) {
      const { data, error } = await db().from("zkp_notifications").update({
        read_at: new Date().toISOString(),
      }).eq("id", id).eq("recipient_user_id", recipientUserId).select("*").maybeSingle();
      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }
      return data ? mapNotification(data as Row) : null;
    },
  };
}

export async function verificationPartyLabels(recruiterUserId: string, learnerUserId: string): Promise<{ recruiterLabel: string; learnerLabel: string }> {
  const [recruiter, learner] = await Promise.all([
    db().from("recruiter_profiles").select("full_name, company_name").eq("user_id", recruiterUserId).maybeSingle(),
    db().from("learner_profiles").select("first_name, last_name, username").eq("user_id", learnerUserId).maybeSingle(),
  ]);
  const company = text(recruiter.data?.company_name);
  const name = text(recruiter.data?.full_name);
  const recruiterLabel = company || name || "A SIJIL recruiter";
  const learnerLabel = resolveLearnerDisplayName(learner.data ?? undefined);
  return { recruiterLabel, learnerLabel: learnerLabel === "Learner" ? "The learner" : learnerLabel };
}

export async function verificationStorageAvailable(): Promise<boolean> {
  const { error } = await db().from("zkp_notifications").select("id").limit(1);
  return !error;
}

export function createVerificationWorkflow(): VerificationNotificationWorkflow {
  return new VerificationNotificationWorkflow(createSupabaseVerificationDirectory());
}

export async function recordPracticalVerificationRequest(input: {
  legacyScoreRequestId: string;
  recruiterUserId: string;
  learnerUserId: string;
  skillLabel: string;
  threshold: number;
  expiresAt: string;
}): Promise<void> {
  try {
    const labels = await verificationPartyLabels(input.recruiterUserId, input.learnerUserId);
    await createVerificationWorkflow().recordPracticalRequest({ ...input, ...labels });
  } catch (err) {
    if (isMissingRelationError(err)) return;
    console.error("verification notification was not saved", { code: (err as { code?: string }).code ?? null });
  }
}

export async function syncPracticalVerification(input: {
  legacyScoreRequestId: string;
  outcome: "generating" | "verified" | "rejected" | "expired" | "failed" | "proof-failed";
}): Promise<void> {
  try {
    const workflow = createVerificationWorkflow();
    if (input.outcome === "generating") {
      await workflow.markGenerating(input.legacyScoreRequestId);
      return;
    }
    const legacyStatus = input.outcome === "verified" || input.outcome === "failed"
      ? "consumed"
      : input.outcome === "rejected"
        ? "declined"
        : input.outcome === "expired"
          ? "expired"
          : "open";
    await workflow.applyLegacyOutcome({
      legacyScoreRequestId: input.legacyScoreRequestId,
      legacyStatus,
      accepted: input.outcome === "verified" ? true : input.outcome === "failed" || input.outcome === "proof-failed" ? false : null,
    });
  } catch (err) {
    if (isMissingRelationError(err)) return;
    console.error("verification notification was not updated", { code: (err as { code?: string }).code ?? null });
  }
}

export const memoryVerificationDirectory = createMemoryVerificationDirectory;

import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { isMissingRelationError } from "../utils/supabase-errors";
import { shareVisibleToRecruiter } from "./share-directory";

export type ShortlistEntry = {
  id: string;
  recruiterUserId: string;
  learnerUserId: string;
  note: string;
  createdAt: string;
};

type Row = Record<string, unknown>;

function map(row: Row): ShortlistEntry {
  return {
    id: String(row.id),
    recruiterUserId: String(row.recruiter_user_id),
    learnerUserId: String(row.learner_user_id),
    note: typeof row.note === "string" ? row.note : "",
    createdAt: String(row.created_at),
  };
}

export async function shortlistAvailable(): Promise<boolean> {
  const { error } = await getServiceSupabase().from("recruiter_shortlist_entries").select("id").limit(1);
  return !error;
}

export async function listShortlist(recruiterUserId: string): Promise<ShortlistEntry[]> {
  const { data, error } = await getServiceSupabase()
    .from("recruiter_shortlist_entries")
    .select("*")
    .eq("recruiter_user_id", recruiterUserId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => map(row as Row));
}

async function learnerIsShared(learnerUserId: string, recruiterUserId: string): Promise<boolean> {
  const { data, error } = await getServiceSupabase()
    .from("selective_disclosure_presentations")
    .select("expires_at, revoked_at, disclosed_payload")
    .eq("learner_id", learnerUserId)
    .is("revoked_at", null)
    .limit(100);
  if (error) return false;
  return (data ?? []).some((row) => shareVisibleToRecruiter({
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    disclosedPayload: row.disclosed_payload,
    recruiterUserId,
  }));
}

export async function addShortlist(recruiterUserId: string, learnerUserId: string, note: string): Promise<ShortlistEntry> {
  if (recruiterUserId === learnerUserId) throw new AppError("Candidate not found", 404);
  if (!await learnerIsShared(learnerUserId, recruiterUserId)) {
    throw new AppError("This learner has not shared a profile with you.", 403);
  }
  const trimmed = note.trim().slice(0, 500);
  const existing = (await listShortlist(recruiterUserId)).find((row) => row.learnerUserId === learnerUserId);
  if (existing) {
    const { data, error } = await getServiceSupabase()
      .from("recruiter_shortlist_entries")
      .update({ note: trimmed, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("recruiter_user_id", recruiterUserId)
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("shortlist was not saved");
    return map(data as Row);
  }
  const { data, error } = await getServiceSupabase().from("recruiter_shortlist_entries").insert({
    id: randomUUID(),
    recruiter_user_id: recruiterUserId,
    learner_user_id: learnerUserId,
    note: trimmed,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("shortlist was not saved");
  return map(data as Row);
}

export async function removeShortlist(recruiterUserId: string, learnerUserId: string): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("recruiter_shortlist_entries")
    .delete()
    .eq("recruiter_user_id", recruiterUserId)
    .eq("learner_user_id", learnerUserId);
  if (error && !isMissingRelationError(error)) throw error;
}

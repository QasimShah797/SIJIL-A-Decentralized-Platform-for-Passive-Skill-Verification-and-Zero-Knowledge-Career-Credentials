import { supabase } from "@/integrations/supabase/client";
import {
  getAttempt as getLocalAttempt,
  saveAttempt as saveLocalAttempt,
  type AttemptRecord,
  type DeclaredSkill,
} from "@/lib/sijil-data";

function rowToAttempt(row: Record<string, unknown>): AttemptRecord {
  return {
    skillId: row.skill_id as string,
    attemptId: row.attempt_id as string,
    startedAt: row.started_at as string,
    endsAt: row.ends_at as string,
    durationMinutes: row.duration_minutes as number,
    status: row.status as AttemptRecord["status"],
    submission: row.submission as string,
    credentialSyncSnapshot: row.credential_sync_snapshot as string | null,
    passed: row.passed as boolean | undefined,
    score: row.score != null ? Number(row.score) : undefined,
    feedback: row.feedback as string | undefined,
  };
}

export async function fetchAttempts(userId: string): Promise<Record<string, AttemptRecord>> {
  const { data, error } = await supabase
    .from("practical_attempts")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  const map: Record<string, AttemptRecord> = {};
  for (const row of data ?? []) {
    map[row.skill_id as string] = rowToAttempt(row);
  }
  return map;
}

/** Load attempts from Supabase and merge any legacy browser-stored attempts. */
export async function loadAttempts(userId: string, skillIds: string[]): Promise<Record<string, AttemptRecord>> {
  const map = await fetchAttempts(userId);

  for (const skillId of skillIds) {
    if (map[skillId]) continue;
    const localAttempt = getLocalAttempt(skillId);
    if (!localAttempt) continue;
    map[skillId] = localAttempt;
    try {
      await saveAttemptDb(userId, localAttempt, { skipLocalWrite: true });
    } catch {
      // Keep merged local attempt for UI even if remote sync fails.
    }
  }

  return map;
}

export async function fetchAttempt(userId: string, skillId: string): Promise<AttemptRecord | null> {
  const { data, error } = await supabase
    .from("practical_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAttempt(data) : null;
}

/** Prefer Supabase; fall back to legacy localStorage and sync upward when possible. */
export async function resolveAttempt(
  userId: string,
  skillId: string,
): Promise<AttemptRecord | null> {
  const dbAttempt = await fetchAttempt(userId, skillId);
  if (dbAttempt) return dbAttempt;

  const localAttempt = getLocalAttempt(skillId);
  if (!localAttempt) return null;

  try {
    await saveAttemptDb(userId, localAttempt, { skipLocalWrite: true });
  } catch {
    // Keep local attempt for display even if remote sync fails.
  }
  return localAttempt;
}

export function isAttemptLocked(
  skill: DeclaredSkill,
  attempt: AttemptRecord | null,
): boolean {
  if (!attempt) return false;
  return (attempt.credentialSyncSnapshot ?? null) === (skill.lastCredentialSyncAt ?? null);
}

export function attemptTaskLabel(attempt: AttemptRecord | null): string {
  if (!attempt) return "No task submitted";
  if (attempt.status === "passed" || attempt.passed) return `Passed · ${attempt.attemptId}`;
  if (attempt.status === "submitted" || attempt.status === "auto_submitted") {
    return `Submitted · ${attempt.attemptId}`;
  }
  if (attempt.status === "in_progress") return `In progress · ${attempt.attemptId}`;
  if (attempt.status === "expired_no_submission") return `Expired · ${attempt.attemptId}`;
  return `Attempt ${attempt.attemptId}`;
}

export function isAttemptSubmitted(attempt: AttemptRecord | null): boolean {
  if (!attempt) return false;
  return attempt.status === "submitted"
    || attempt.status === "auto_submitted"
    || attempt.status === "passed"
    || attempt.passed === true;
}

export async function saveAttemptDb(
  userId: string,
  rec: AttemptRecord,
  opts?: { skipLocalWrite?: boolean },
): Promise<void> {
  if (!opts?.skipLocalWrite) {
    saveLocalAttempt(rec);
  }

  const row = {
    skill_id: rec.skillId,
    user_id: userId,
    attempt_id: rec.attemptId,
    started_at: rec.startedAt,
    ends_at: rec.endsAt,
    duration_minutes: rec.durationMinutes,
    status: rec.status,
    submission: rec.submission,
    credential_sync_snapshot: rec.credentialSyncSnapshot,
    passed: rec.passed ?? null,
    score: rec.score ?? null,
    feedback: rec.feedback ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: fetchError } = await supabase
    .from("practical_attempts")
    .select("skill_id")
    .eq("user_id", userId)
    .eq("skill_id", rec.skillId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await supabase
      .from("practical_attempts")
      .update({
        attempt_id: row.attempt_id,
        started_at: row.started_at,
        ends_at: row.ends_at,
        duration_minutes: row.duration_minutes,
        status: row.status,
        submission: row.submission,
        credential_sync_snapshot: row.credential_sync_snapshot,
        passed: row.passed,
        score: row.score,
        feedback: row.feedback,
        updated_at: row.updated_at,
      })
      .eq("user_id", userId)
      .eq("skill_id", rec.skillId);
    if (error) throw error;
    return;
  }

  const { error: insertError } = await supabase.from("practical_attempts").insert(row);
  if (insertError) throw insertError;
}

export async function markAttemptPassed(
  userId: string,
  rec: AttemptRecord,
  score: number,
  feedback: string,
): Promise<void> {
  await saveAttemptDb(userId, {
    ...rec,
    status: "passed",
    passed: true,
    score,
    feedback,
  });
}

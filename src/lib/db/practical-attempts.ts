import { supabase } from "@/integrations/supabase/client";
import type { AttemptRecord } from "@/lib/sijil-data";

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

export async function saveAttemptDb(userId: string, rec: AttemptRecord): Promise<void> {
  const { error } = await supabase.from("practical_attempts").upsert({
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
  }, { onConflict: "user_id,skill_id" });
  if (error) throw error;
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

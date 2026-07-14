import { supabase } from "@/integrations/supabase/client";
import {
  getAttempt as getLocalAttempt,
  saveAttempt as saveLocalAttempt,
  type AttemptRecord,
  type DeclaredSkill,
} from "@/lib/sijil-data";
import { isMissingColumnError, isMissingRelationError } from "@/lib/supabase-errors";
import { isMcqPassed } from "@/lib/mcq-tasks";

export type McqAttemptResultRow = {
  id: string;
  skill_id: string | null;
  competency_name: string | null;
  competency_domain: string | null;
  title: string | null;
  status: string | null;
  percentage: number | null;
  correct_count: number | null;
  total_questions: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  created_at: string | null;
};

function rawTable(table: string) {
  return (supabase as unknown as {
    from: (name: string) => any;
  }).from(table);
}

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

export type PracticalTaskState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export function isMcqRowCompleted(row: McqAttemptResultRow): boolean {
  const status = String(row.status ?? "").toLowerCase();
  return status === "completed"
    || status === "submitted"
    || status === "passed"
    || row.submitted_at != null
    || (typeof row.percentage === "number" && row.submitted_at != null);
}

function isMcqRowInProgress(row: McqAttemptResultRow): boolean {
  if (isMcqRowCompleted(row)) return false;
  const status = String(row.status ?? "").toLowerCase();
  return status === "in_progress" || status === "in progress";
}

export function mcqResultToAttemptRecord(
  skillId: string,
  row: McqAttemptResultRow,
  existing?: AttemptRecord | null,
): AttemptRecord {
  const percentage = typeof row.percentage === "number" ? row.percentage : undefined;
  const passed = typeof row.passed === "boolean" ? row.passed : (percentage != null ? isMcqPassed(percentage) : undefined);
  const status: AttemptRecord["status"] = passed === true
    ? "passed"
    : isMcqRowCompleted(row)
      ? "submitted"
      : "in_progress";

  return {
    skillId,
    attemptId: row.id,
    startedAt: row.created_at ?? existing?.startedAt ?? new Date().toISOString(),
    endsAt: row.submitted_at ?? existing?.endsAt ?? new Date().toISOString(),
    durationMinutes: existing?.durationMinutes ?? 10,
    status,
    submission: existing?.submission ?? "",
    credentialSyncSnapshot: existing?.credentialSyncSnapshot ?? null,
    passed,
    score: percentage,
    feedback: row.title ?? existing?.feedback,
  };
}

export function derivePracticalTaskState(
  attempt: AttemptRecord | null,
  mcqResult: McqAttemptResultRow | null,
): PracticalTaskState {
  if (mcqResult && isMcqRowCompleted(mcqResult)) return "COMPLETED";
  if (attempt && (attempt.status === "submitted" || attempt.status === "auto_submitted" || attempt.status === "passed")) {
    return "COMPLETED";
  }
  if (mcqResult && isMcqRowInProgress(mcqResult)) return "IN_PROGRESS";
  if (attempt?.status === "in_progress") return "IN_PROGRESS";
  return "NOT_STARTED";
}

export async function fetchLatestCompletedMcqAttemptResult(
  userId: string,
  skillId: string,
): Promise<McqAttemptResultRow | null> {
  const completedColumns = "id, skill_id, competency_name, competency_domain, title, status, percentage, correct_count, total_questions, passed, submitted_at, created_at";
  const basicColumns = "id, skill_id, competency_name, competency_domain, title, status, passed, submitted_at, created_at";

  for (const columns of [completedColumns, basicColumns]) {
    try {
      const { data, error } = await rawTable("mcq_task_attempts")
        .select(columns)
        .eq("learner_user_id", userId)
        .eq("skill_id", skillId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      const row = ((data ?? [])[0] as McqAttemptResultRow | undefined) ?? null;
      if (row) return row;
    } catch (error) {
      if (!isMissingColumnError(error) && !isMissingRelationError(error)) {
        console.warn("mcq_task_attempts completed query failed:", error);
      }
    }
  }

  try {
    const { data, error } = await rawTable("mcq_task_attempts")
      .select(completedColumns)
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return ((data ?? [])[0] as McqAttemptResultRow | undefined) ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("mcq_task_attempts completed status query failed:", error);
    }
    return null;
  }
}

export async function fetchLatestMcqAttemptResults(
  userId: string,
  skillIds: string[],
): Promise<Record<string, McqAttemptResultRow>> {
  const map: Record<string, McqAttemptResultRow> = {};
  await Promise.all(skillIds.map(async (skillId) => {
    const completed = await fetchLatestCompletedMcqAttemptResult(userId, skillId);
    if (completed) {
      map[skillId] = completed;
      return;
    }
    const latest = await fetchLatestMcqAttemptResult(userId, skillId);
    if (latest) map[skillId] = latest;
  }));
  return map;
}

/** Load attempts from Supabase, merge MCQ results, and prefer completed over stale in-progress rows. */
export async function loadAttempts(
  userId: string,
  skillIds: string[],
): Promise<Record<string, AttemptRecord>> {
  const { attempts } = await loadAttemptsWithMcqResults(userId, skillIds);
  return attempts;
}

export async function loadAttemptsWithMcqResults(
  userId: string,
  skillIds: string[],
): Promise<{
  attempts: Record<string, AttemptRecord>;
  mcqResults: Record<string, McqAttemptResultRow>;
}> {
  const map = await fetchAttempts(userId);
  const mcqResults = await fetchLatestMcqAttemptResults(userId, skillIds);

  for (const skillId of skillIds) {
    const mcqResult = mcqResults[skillId] ?? null;
    if (mcqResult && isMcqRowCompleted(mcqResult)) {
      map[skillId] = mcqResultToAttemptRecord(skillId, mcqResult, map[skillId] ?? null);
      continue;
    }

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

  return { attempts: map, mcqResults };
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

export async function fetchMcqAttemptHistory(
  userId: string,
  skillId: string,
): Promise<McqAttemptResultRow[]> {
  try {
    const { data, error } = await rawTable("mcq_task_attempts")
      .select("id, skill_id, competency_name, competency_domain, title, status, percentage, correct_count, total_questions, passed, submitted_at, created_at")
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as McqAttemptResultRow[];
  } catch (error) {
    if (!isMissingColumnError(error) && !isMissingRelationError(error)) {
      console.warn("mcq_task_attempts history query failed:", error);
    }
  }

  try {
    const { data, error } = await rawTable("mcq_task_attempts")
      .select("id, skill_id, competency_name, competency_domain, title, status, passed, submitted_at, created_at")
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as McqAttemptResultRow[];
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("mcq_task_attempts basic history query failed:", error);
    }
    return [];
  }
}

export async function fetchLatestMcqAttemptResult(
  userId: string,
  skillId: string,
): Promise<McqAttemptResultRow | null> {
  const completed = await fetchLatestCompletedMcqAttemptResult(userId, skillId);
  if (completed) return completed;

  try {
    const { data, error } = await rawTable("mcq_task_attempts")
      .select("id, skill_id, competency_name, competency_domain, title, status, percentage, correct_count, total_questions, passed, submitted_at, created_at")
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return ((data ?? [])[0] as McqAttemptResultRow | undefined) ?? null;
  } catch (error) {
    if (!isMissingColumnError(error) && !isMissingRelationError(error)) {
      console.warn("mcq_task_attempts result query failed:", error);
    }
  }

  try {
    const { data, error } = await rawTable("mcq_task_attempts")
      .select("id, skill_id, competency_name, competency_domain, title, status, passed, submitted_at, created_at")
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return ((data ?? [])[0] as McqAttemptResultRow | undefined) ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.warn("mcq_task_attempts basic result query failed:", error);
    }
    return null;
  }
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

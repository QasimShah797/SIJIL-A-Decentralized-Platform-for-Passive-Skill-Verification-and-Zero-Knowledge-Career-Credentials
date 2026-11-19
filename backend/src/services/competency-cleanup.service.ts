/**
 * Removes integration links, reviews, attestation requests, and other data
 * tied to a competency before the declared_skills row is deleted.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";

function rawTable(table: string) {
  return supabaseService.client.from(table);
}

async function deleteStorageFilesForSkill(userId: string, skillId: string): Promise<void> {
  const { data: records } = await supabaseService.client
    .from("supporting_records")
    .select("url")
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  const paths = (records ?? [])
    .map((row) => {
      const url = row.url as string | null;
      if (!url) return null;
      const marker = "/skill-evidence/";
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      return url.slice(idx + marker.length);
    })
    .filter((path): path is string => !!path);

  if (paths.length > 0) {
    await supabaseService.client.storage.from("skill-evidence").remove(paths);
  }
}

export async function cleanupCompetencyRelatedData(
  userId: string,
  skillId: string,
  skillName: string,
): Promise<void> {
  const normalizedName = skillName.trim();

  await deleteStorageFilesForSkill(userId, skillId);

  const cleanupTasks: Array<PromiseLike<unknown>> = [
    supabaseService.client.from("peer_reviews").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("peer_reviews").delete().eq("learner_user_id", userId).eq("skill", normalizedName),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("skill", normalizedName),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("competency_name", normalizedName),
    rawTable("review_requests").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    rawTable("peer_review_invites").delete().eq("skill_id", skillId),
    supabaseService.client.from("institution_attestation_requests").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("attestations").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("credentials").delete().eq("user_id", userId).eq("skill_name", normalizedName),
    supabaseService.client.from("lms_evidence").delete().eq("user_id", userId).eq("linked_skill_id", skillId),
    supabaseService.client
      .from("github_repos")
      .update({ linked_skill_id: null, linked_skill_name: null, linked_at: null })
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId),
    supabaseService.client
      .from("github_activities")
      .update({ linked_skill_id: null })
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId),
    supabaseService.client
      .from("evidence_records")
      .update({ mapped_skill_id: null })
      .eq("user_id", userId)
      .eq("mapped_skill_id", skillId),
    supabaseService.client
      .from("evidence_records")
      .update({ suggested_skill_id: null, suggested_skill_name: null })
      .eq("user_id", userId)
      .eq("suggested_skill_id", skillId),
    supabaseService.client
      .from("github_repo_skill_links")
      .delete()
      .eq("user_id", userId)
      .eq("skill_id", skillId),
    supabaseService.client
      .from("skill_evidence_links")
      .delete()
      .eq("user_id", userId)
      .eq("skill_id", skillId),
    supabaseService.client.from("supporting_records").delete().eq("user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("wallet_competency_records").delete().eq("learner_id", userId).eq("competency_id", skillId),
    supabaseService.client.from("selective_disclosure_presentations").delete().eq("learner_id", userId).eq("competency_id", skillId),
    supabaseService.client.from("practical_attempts").delete().eq("user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("mcq_task_attempts").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("github_discussion_reviews").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
  ];

  await Promise.allSettled(cleanupTasks);
}

const REFERENCE_COLUMNS = [
  "skill_id",
  "competency_id",
  "mapped_skill_id",
  "suggested_skill_id",
  "linked_skill_id",
] as const;

type DbError = { message?: string; details?: string | null; code?: string };

export function blockingForeignTable(error: DbError): string | null {
  const details = error.details ?? "";
  const fromDetails = details.match(/referenced from table "([A-Za-z_][A-Za-z0-9_]*)"/);
  if (fromDetails?.[1] && fromDetails[1] !== "declared_skills") return fromDetails[1];

  const message = error.message ?? "";
  const matches = [...message.matchAll(/on table "([A-Za-z_][A-Za-z0-9_]*)"/g)];
  const table = matches.length ? matches[matches.length - 1]?.[1] : null;
  if (table && table !== "declared_skills") return table;
  return null;
}

function isForeignKeyViolation(error: DbError): boolean {
  return error.code === "23503" || /foreign key constraint/i.test(error.message ?? "");
}

function isIgnorableSchemaError(error: unknown): boolean {
  return isMissingColumnError(error) || isMissingRelationError(error);
}

async function referenceRowsChanged(
  table: string,
  column: string,
  skillId: string,
  mode: "null" | "delete",
): Promise<"changed" | "none" | "skip"> {
  const query = supabaseService.client.from(table);
  const result = mode === "delete"
    ? await query.delete().eq(column, skillId).select()
    : await query.update({ [column]: null }).eq(column, skillId).select();

  if (result.error) {
    if (isIgnorableSchemaError(result.error)) return "skip";
    return "none";
  }
  return Array.isArray(result.data) && result.data.length > 0 ? "changed" : "none";
}

async function clearTableReferences(table: string, skillId: string): Promise<boolean> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || table === "declared_skills") return false;

  let changed = false;
  for (const column of REFERENCE_COLUMNS) {
    const nulled = await referenceRowsChanged(table, column, skillId, "null");
    if (nulled === "changed") {
      changed = true;
      continue;
    }
    const removed = await referenceRowsChanged(table, column, skillId, "delete");
    if (removed === "changed") changed = true;
  }
  return changed;
}

/** Deletes the declared skill, detaching rows that still reference it. */
export async function removeDeclaredSkillRow(userId: string, skillId: string): Promise<void> {
  let lastError: DbError | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabaseService.client
      .from("declared_skills")
      .delete()
      .eq("user_id", userId)
      .eq("id", skillId);

    if (!error) return;

    lastError = error;
    if (!isForeignKeyViolation(error)) throw new AppError(error.message, 500);

    const table = blockingForeignTable(error);
    if (!table || !(await clearTableReferences(table, skillId))) break;
  }

  throw new AppError(lastError?.message || "Could not remove competency", 500);
}

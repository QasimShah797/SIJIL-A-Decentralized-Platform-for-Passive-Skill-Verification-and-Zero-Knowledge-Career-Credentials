/**
 * Copies genuine linked GitHub repositories into supporting_records.
 * Dedupes on user + skill + GitHub source + normalized repo URL.
 */
import { supabaseService } from "./supabase.service";
import { hashEvidenceRecord } from "../utils/evidence-hash";
import { EVIDENCE_SOURCE } from "../constants/evidence";
import {
  findDuplicateGitHubSupportingRecord,
  isQualifyingGitHubEvidence,
  normalizeGitHubRepoUrl,
  qualifyingGitHubTitle,
} from "../utils/github-supporting-record";

export interface GitHubRepoEvidenceInput {
  title?: string | null;
  url?: string | null;
  occurredAt?: string | null;
}

export interface GitHubSupportingUpsertResult {
  written: boolean;
  duplicate: boolean;
  reason?: string;
}

async function assertSkillOwnedByUser(userId: string, skillId: string): Promise<boolean> {
  const { data, error } = await supabaseService.client
    .from("declared_skills")
    .select("id")
    .eq("id", skillId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

export async function upsertGitHubSupportingRecord(
  userId: string,
  skillId: string,
  input: GitHubRepoEvidenceInput,
): Promise<GitHubSupportingUpsertResult> {
  const title = qualifyingGitHubTitle(input.title);
  const url = normalizeGitHubRepoUrl(input.url);
  if (
    !title
    || !url
    || !isQualifyingGitHubEvidence({
      userId,
      skillId,
      skillOwnerId: userId,
      title,
      url,
    })
  ) {
    return { written: false, duplicate: false, reason: "invalid_github_evidence" };
  }

  const owned = await assertSkillOwnedByUser(userId, skillId);
  if (!owned) {
    return { written: false, duplicate: false, reason: "skill_not_owned" };
  }

  const { data: existing, error: fetchErr } = await supabaseService.client
    .from("supporting_records")
    .select("id, url")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("source", EVIDENCE_SOURCE.GITHUB);

  if (fetchErr) {
    return { written: false, duplicate: false, reason: fetchErr.message };
  }

  const contentHash = hashEvidenceRecord({
    source: EVIDENCE_SOURCE.GITHUB,
    title,
    url,
  });
  const occurredAt = input.occurredAt || new Date().toISOString();
  const duplicate = findDuplicateGitHubSupportingRecord(existing ?? [], url);

  if (duplicate?.id) {
    const { error: updateErr } = await supabaseService.client
      .from("supporting_records")
      .update({
        title,
        url,
        occurred_at: occurredAt,
        content_hash: contentHash,
      })
      .eq("id", duplicate.id)
      .eq("user_id", userId)
      .eq("skill_id", skillId);
    if (updateErr) {
      return { written: false, duplicate: true, reason: updateErr.message };
    }
    return { written: true, duplicate: true };
  }

  const { error: insertErr } = await supabaseService.client
    .from("supporting_records")
    .insert({
      user_id: userId,
      skill_id: skillId,
      source: EVIDENCE_SOURCE.GITHUB,
      title,
      url,
      occurred_at: occurredAt,
      content_hash: contentHash,
    });
  if (insertErr) {
    return { written: false, duplicate: false, reason: insertErr.message };
  }
  return { written: true, duplicate: false };
}

export async function deleteGitHubSupportingRecord(
  userId: string,
  skillId: string,
  url: string | null | undefined,
): Promise<void> {
  const normalized = normalizeGitHubRepoUrl(url);
  if (!normalized) return;

  const { data: existing } = await supabaseService.client
    .from("supporting_records")
    .select("id, url")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .eq("source", EVIDENCE_SOURCE.GITHUB);

  const matches = (existing ?? []).filter(
    (row) => normalizeGitHubRepoUrl(row.url) === normalized,
  );
  if (!matches.length) return;

  await supabaseService.client
    .from("supporting_records")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .in("id", matches.map((row) => row.id));
}

export async function upsertLinkedGitHubReposForUser(
  userId: string,
  skillId?: string,
): Promise<number> {
  const { data: connection } = await supabaseService.client
    .from("github_connections")
    .select("github_username")
    .eq("user_id", userId)
    .maybeSingle();
  const connectedUsername = typeof connection?.github_username === "string"
    ? connection.github_username.trim().toLowerCase()
    : "";
  if (!connectedUsername) return 0;

  let query = supabaseService.client
    .from("github_repos")
    .select("repo_name, github_url, last_updated, linked_skill_id, github_username")
    .eq("user_id", userId)
    .not("linked_skill_id", "is", null);
  if (skillId) query = query.eq("linked_skill_id", skillId);

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  let written = 0;
  for (const row of data) {
    const linkedSkillId = row.linked_skill_id as string | null;
    if (!linkedSkillId) continue;
    const rowUsername = typeof row.github_username === "string"
      ? row.github_username.trim().toLowerCase()
      : "";
    if (rowUsername !== connectedUsername) continue;

    const result = await upsertGitHubSupportingRecord(userId, linkedSkillId, {
      title: row.repo_name as string | null,
      url: row.github_url as string | null,
      occurredAt: (row.last_updated as string | null) ?? null,
    });
    if (result.written) written += 1;
  }
  return written;
}

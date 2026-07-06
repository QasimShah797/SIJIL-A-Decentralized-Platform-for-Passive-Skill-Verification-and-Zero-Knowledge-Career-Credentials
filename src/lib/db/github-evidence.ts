/**
 * GitHub evidence records — API-first with Supabase/github_repos fallback.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getUnmappedEvidenceApi,
  getLinkedProjectEvidenceApi,
  linkEvidenceToSkillApi,
  unlinkEvidenceFromSkillApi,
  unlinkRepoEvidenceApi,
  ignoreEvidenceApi,
  type GitHubEvidenceView,
  type ProjectEvidenceApiView,
  type SkillLinkApiView,
} from "@/services/api/github.api";

import { buildMatchReasonForSkill } from "@/lib/evidence-matching";
import { isMissingColumnError, isMissingRelationError } from "@/lib/supabase-errors";

export type { GitHubEvidenceView, ProjectEvidenceApiView, SkillLinkApiView };

function enrichProjectsWithBreakdown(
  projects: ProjectEvidenceApiView[],
  breakdownByRepoId: Map<number, Record<string, number>>,
): ProjectEvidenceApiView[] {
  return projects.map((p) => {
    let breakdown = p.languageBreakdown;
    if (!Object.keys(breakdown).length) {
      breakdown = breakdownByRepoId.get(p.githubRepoId) ?? {};
    }
    return {
      ...p,
      languageBreakdown: breakdown,
      skillLinks: p.skillLinks.map((link) => ({
        ...link,
        matchReason: link.matchReason ?? buildMatchReasonForSkill(link.skillName, breakdown),
      })),
    };
  });
}

async function loadBreakdownFromEvidence(
  userId: string,
  repoIdNums: number[],
): Promise<Map<number, Record<string, number>>> {
  const map = new Map<number, Record<string, number>>();
  if (!repoIdNums.length) return map;

  const { data: evidenceRows, error } = await supabase
    .from("evidence_records")
    .select("github_repo_id, metadata")
    .eq("user_id", userId)
    .in("github_repo_id", repoIdNums);

  if (error) {
    if (!isMissingRelationError(error) && !isMissingColumnError(error)) {
      console.warn("evidence_records breakdown query failed:", error);
    }
    return map;
  }

  for (const row of evidenceRows ?? []) {
    const fromMeta = parseBreakdown(
      (row.metadata as Record<string, unknown> | null)?.language_breakdown,
    );
    if (Object.keys(fromMeta).length) {
      map.set(Number(row.github_repo_id), fromMeta);
    }
  }
  return map;
}

export async function syncGitHubViaBackend(
  _declaredSkills: { id: string; name: string; domain?: string }[],
): Promise<{
  usedBackend: boolean;
  result?: { reposFetched: number; evidenceCreated: number; activitiesSynced: number };
}> {
  return { usedBackend: false };
}

function parseBreakdown(raw: unknown): Record<string, number> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, number>;
  }
  return {};
}

export async function fetchLinkedProjectEvidence(
  userId: string,
): Promise<ProjectEvidenceApiView[]> {
  const viaApi = await getLinkedProjectEvidenceApi();
  if (viaApi?.length) return viaApi;

  const { data: links, error: linksError } = await supabase
    .from("github_repo_skill_links")
    .select("github_repo_id, skill_id, match_reason, linked_at, declared_skills(name)")
    .eq("user_id", userId);

  if (linksError && !isMissingRelationError(linksError)) {
    console.warn("github_repo_skill_links query failed:", linksError);
  }

  if (!linksError && links?.length) {
    const repoIds = [...new Set(links.map((l) => l.github_repo_id as string))];
    const { data: repos } = await supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .in("id", repoIds)
      .order("last_updated", { ascending: false, nullsFirst: false });

    const linksByRepo = new Map<string, SkillLinkApiView[]>();
    for (const link of links) {
      const repoUuid = link.github_repo_id as string;
      const skillData = link.declared_skills as { name?: string } | null;
      const entry: SkillLinkApiView = {
        skillId: link.skill_id as string,
        skillName: skillData?.name ?? "",
        matchReason: (link.match_reason as string | null) ?? null,
        linkedAt: link.linked_at as string,
      };
      const list = linksByRepo.get(repoUuid) ?? [];
      list.push(entry);
      linksByRepo.set(repoUuid, list);
    }

    const projects = (repos ?? []).map((repo) => ({
      repoId: repo.id as string,
      githubRepoId: repo.repo_id as number,
      repositoryName: repo.repo_name as string,
      repoFullName: repo.full_name as string,
      repositoryUrl: repo.github_url as string,
      description: repo.description as string | null,
      primaryLanguage: repo.primary_language as string | null,
      languageBreakdown: parseBreakdown(
        (repo as Record<string, unknown>).language_breakdown
          ?? (repo as Record<string, unknown>).metadata
            ? ((repo as Record<string, unknown>).metadata as Record<string, unknown>)?.language_breakdown
            : undefined,
      ),
      topics: Array.isArray((repo as Record<string, unknown>).topics)
        ? ((repo as Record<string, unknown>).topics as string[])
        : [],
      lastUpdated: repo.last_updated as string | null,
      commitCount: repo.commit_count as number | null,
      evidenceRecordId: "",
      skillLinks: linksByRepo.get(repo.id as string) ?? [],
    }));

    const breakdownMap = await loadBreakdownFromEvidence(
      userId,
      projects.map((p) => p.githubRepoId),
    );
    return enrichProjectsWithBreakdown(projects, breakdownMap);
  }

  const { data: legacyRepos } = await supabase
    .from("github_repos")
    .select("*")
    .eq("user_id", userId)
    .not("linked_skill_id", "is", null)
    .order("last_updated", { ascending: false, nullsFirst: false });

  const projects = (legacyRepos ?? []).map((repo) => ({
    repoId: repo.id as string,
    githubRepoId: repo.repo_id as number,
    repositoryName: repo.repo_name as string,
    repoFullName: repo.full_name as string,
    repositoryUrl: repo.github_url as string,
    description: repo.description as string | null,
    primaryLanguage: repo.primary_language as string | null,
    languageBreakdown: parseBreakdown(
      (repo as Record<string, unknown>).language_breakdown
        ?? (repo as Record<string, unknown>).metadata
          ? ((repo as Record<string, unknown>).metadata as Record<string, unknown>)?.language_breakdown
          : undefined,
    ),
    topics: Array.isArray((repo as Record<string, unknown>).topics)
      ? ((repo as Record<string, unknown>).topics as string[])
      : [],
    lastUpdated: repo.last_updated as string | null,
    commitCount: repo.commit_count as number | null,
    evidenceRecordId: "",
    skillLinks: [{
      skillId: repo.linked_skill_id as string,
      skillName: repo.linked_skill_name as string,
      matchReason: null,
      linkedAt: repo.linked_at as string,
    }],
  }));

  const breakdownMap = await loadBreakdownFromEvidence(
    userId,
    projects.map((p) => p.githubRepoId),
  );
  return enrichProjectsWithBreakdown(projects, breakdownMap);
}

export async function fetchUnmappedGitHubEvidence(
  userId: string,
): Promise<GitHubEvidenceView[]> {
  const viaApi = await getUnmappedEvidenceApi();
  if (viaApi?.length) return viaApi;

  const { data, error } = await supabase
    .from("evidence_records")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["Unmapped Project Evidence", "Unmapped Evidence"])
    .order("last_updated", { ascending: false, nullsFirst: false });

  if (!error && data?.length) {
    return data.map(rowToViewFromDb);
  }

  if (error && !isMissingRelationError(error) && !isMissingColumnError(error)) {
    console.warn("evidence_records unmapped query failed:", error);
  }

  const { data: repos } = await supabase
    .from("github_repos")
    .select("*")
    .eq("user_id", userId)
    .is("linked_skill_id", null)
    .order("last_updated", { ascending: false, nullsFirst: false });

  return (repos ?? []).map((r) => ({
    id: r.id as string,
    source: "GitHub",
    status: "Unmapped Evidence",
    repositoryName: r.repo_name as string,
    repositoryUrl: r.github_url as string,
    description: r.description as string | null,
    language: r.primary_language as string | null,
    stars: 0,
    forks: 0,
    lastUpdated: r.last_updated as string | null,
    commitCount: r.commit_count as number | null,
    prSummary: null,
    syncDate: r.synced_at as string,
    suggestedSkillId: null,
    suggestedSkillName: r.linked_skill_name as string | null,
    mappedSkillId: null,
    githubRepoId: r.repo_id as number,
  }));
}

function rowToViewFromDb(row: Record<string, unknown>): GitHubEvidenceView {
  return {
    id: row.id as string,
    source: row.source as string,
    status: row.status as string,
    repositoryName: row.repository_name as string,
    repositoryUrl: row.repository_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stars: (row.stars as number) ?? 0,
    forks: (row.forks as number) ?? 0,
    lastUpdated: row.last_updated as string | null,
    commitCount: row.commit_count as number | null,
    prSummary: row.pr_summary as Record<string, unknown> | null,
    syncDate: row.sync_date as string,
    suggestedSkillId: row.suggested_skill_id as string | null,
    suggestedSkillName: row.suggested_skill_name as string | null,
    mappedSkillId: row.mapped_skill_id as string | null,
    githubRepoId: row.github_repo_id as number | null,
  };
}

export async function linkGitHubEvidenceToSkill(
  userId: string,
  skillId: string,
  evidence: GitHubEvidenceView,
  skillName: string,
): Promise<void> {
  const viaApi = await linkEvidenceToSkillApi(skillId, evidence.id);
  if (viaApi) return;

  if (evidence.githubRepoId) {
    const { data: repo } = await supabase
      .from("github_repos")
      .select("id")
      .eq("user_id", userId)
      .eq("repo_id", evidence.githubRepoId)
      .maybeSingle();
    if (repo?.id) {
      await updateGitHubRepoLink(repo.id as string, skillId, skillName);
      await updateSkillEvidenceLinked(userId, skillId);
      return;
    }
  }

  await updateGitHubRepoLink(evidence.id, skillId, skillName);
  await updateSkillEvidenceLinked(userId, skillId);
}

export async function unlinkGitHubRepoFromSkill(
  userId: string,
  repoId: string,
  linkedSkillId: string | null,
): Promise<void> {
  const viaApi = linkedSkillId
    ? await unlinkRepoEvidenceApi(repoId, linkedSkillId)
    : await unlinkRepoEvidenceApi(repoId);
  if (viaApi) return;

  await updateGitHubRepoLink(repoId, null, null);
  if (linkedSkillId) {
    await revertSkillIfNoLinkedEvidence(userId, linkedSkillId);
  }
}

export async function unlinkGitHubEvidenceFromSkill(
  userId: string,
  skillId: string,
  evidenceId: string,
): Promise<void> {
  const viaApi = await unlinkEvidenceFromSkillApi(skillId, evidenceId);
  if (viaApi) return;

  await supabase
    .from("evidence_records")
    .update({
      status: "Unmapped Evidence",
      mapped_skill_id: null,
    })
    .eq("id", evidenceId)
    .eq("user_id", userId);

  await revertSkillIfNoLinkedEvidence(userId, skillId);
}

async function updateGitHubRepoLink(
  repoId: string,
  skillId: string | null,
  skillName: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("github_repos")
    .update({
      linked_skill_id: skillId,
      linked_skill_name: skillName,
      linked_at: skillId ? new Date().toISOString() : null,
    })
    .eq("id", repoId);
  if (error) throw error;
}

async function revertSkillIfNoLinkedEvidence(userId: string, skillId: string): Promise<void> {
  const { data: repos } = await supabase
    .from("github_repos")
    .select("id")
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId)
    .limit(1);

  if (repos?.length) return;

  await supabase
    .from("declared_skills")
    .update({
      status: "Skill Claimed",
      pipeline_stage: "declared",
    })
    .eq("user_id", userId)
    .eq("id", skillId);
}

async function updateSkillEvidenceLinked(userId: string, skillId: string): Promise<void> {
  await supabase
    .from("declared_skills")
    .update({
      status: "Evidence Linked",
      pipeline_stage: "evidence_linked",
      last_related_activity_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", skillId);
}

export async function ignoreGitHubEvidence(evidenceId: string): Promise<boolean> {
  const viaApi = await ignoreEvidenceApi(evidenceId);
  if (viaApi) return true;

  const { error } = await supabase
    .from("evidence_records")
    .update({ status: "Ignored" })
    .eq("id", evidenceId);
  return !error;
}

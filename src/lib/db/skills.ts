import { supabase } from "@/integrations/supabase/client";
import type { RelatedEvidenceApiView } from "@/services/api/skills.api";
import { syncGitHubAfterSkillDeclare } from "@/lib/github-integration";
import { cleanupCompetencyRelatedData } from "@/lib/db/competency-cleanup";
import { deleteSkillApi } from "@/services/api/skills.api";
import type { DeclaredSkill } from "@/lib/sijil-data";

function rowToSkill(row: {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  status: string;
  pipeline_stage?: string | null;
  last_related_activity_at: string | null;
  last_credential_sync_at: string | null;
}): DeclaredSkill {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    description: row.description ?? "",
    status: row.status,
    pipelineStage: row.pipeline_stage ?? "declared",
    lastRelatedActivityAt: row.last_related_activity_at,
    lastCredentialSyncAt: row.last_credential_sync_at,
  };
}

const SKILL_STATUSES_PRESERVED = new Set([
  "Wallet Ready",
  "Credential Issued",
  "Review Available",
  "Attestation Pending",
]);

/** Align declared_skills badges with linked GitHub/LMS/uploaded evidence. */
export async function syncDeclaredSkillEvidenceStatuses(userId: string): Promise<void> {
  const { data: skills, error: skillsError } = await supabase
    .from("declared_skills")
    .select("id, status")
    .eq("user_id", userId);
  if (skillsError) throw skillsError;
  if (!skills?.length) return;

  const [
    { data: githubRepos },
    { data: evidenceLinks },
    { data: lmsEvidence },
    { data: supportingRecords },
    { data: evidenceRecords },
  ] = await Promise.all([
    supabase
      .from("github_repos")
      .select("linked_skill_id")
      .eq("user_id", userId)
      .not("linked_skill_id", "is", null),
    supabase
      .from("skill_evidence_links")
      .select("skill_id")
      .eq("user_id", userId),
    supabase
      .from("lms_evidence")
      .select("linked_skill_id")
      .eq("user_id", userId)
      .not("linked_skill_id", "is", null),
    supabase
      .from("supporting_records")
      .select("skill_id")
      .eq("user_id", userId),
    supabase
      .from("evidence_records")
      .select("mapped_skill_id")
      .eq("user_id", userId)
      .not("mapped_skill_id", "is", null),
  ]);

  const linkedSkillIds = new Set<string>();
  for (const row of githubRepos ?? []) {
    if (row.linked_skill_id) linkedSkillIds.add(row.linked_skill_id as string);
  }
  for (const row of evidenceLinks ?? []) {
    if (row.skill_id) linkedSkillIds.add(row.skill_id as string);
  }
  for (const row of lmsEvidence ?? []) {
    if (row.linked_skill_id) linkedSkillIds.add(row.linked_skill_id as string);
  }
  for (const row of supportingRecords ?? []) {
    if (row.skill_id) linkedSkillIds.add(row.skill_id as string);
  }
  for (const row of evidenceRecords ?? []) {
    if (row.mapped_skill_id) linkedSkillIds.add(row.mapped_skill_id as string);
  }

  const now = new Date().toISOString();
  await Promise.all(
    skills.map(async (skill) => {
      const status = skill.status as string;
      if (SKILL_STATUSES_PRESERVED.has(status)) return;

      const hasEvidence = linkedSkillIds.has(skill.id as string);
      if (hasEvidence && status === "Skill Claimed") {
        const { error } = await supabase
          .from("declared_skills")
          .update({
            status: "Evidence Linked",
            pipeline_stage: "evidence_linked",
            last_related_activity_at: now,
          })
          .eq("user_id", userId)
          .eq("id", skill.id);
        if (error) throw error;
        return;
      }

      if (!hasEvidence && status === "Evidence Linked") {
        const { error } = await supabase
          .from("declared_skills")
          .update({
            status: "Skill Claimed",
            pipeline_stage: "declared",
          })
          .eq("user_id", userId)
          .eq("id", skill.id);
        if (error) throw error;
      }
    }),
  );
}

export async function fetchDeclaredSkills(userId: string): Promise<DeclaredSkill[]> {
  await syncDeclaredSkillEvidenceStatuses(userId);
  const { data, error } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSkill);
}

export async function fetchDeclaredSkillsForUsers(userIds: string[]): Promise<Record<string, DeclaredSkill[]>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from("declared_skills")
    .select("*")
    .in("user_id", userIds);
  if (error) throw error;
  const map: Record<string, DeclaredSkill[]> = {};
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (!map[uid]) map[uid] = [];
    map[uid].push(rowToSkill(row));
  }
  return map;
}

export async function insertDeclaredSkill(
  userId: string,
  skill: Pick<DeclaredSkill, "name" | "domain" | "description">,
  allDeclaredSkills?: DeclaredSkill[],
): Promise<DeclaredSkill> {
  const normalizedName = skill.name.trim().toLowerCase();
  const normalizedDomain = (skill.domain || "General").trim().toLowerCase();
  const { data: existing, error: existingError } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId);
  if (existingError) throw existingError;

  const existingSkill = (existing ?? []).find((row) =>
    String(row.name ?? "").trim().toLowerCase() === normalizedName
    && String(row.domain ?? "General").trim().toLowerCase() === normalizedDomain,
  );
  if (existingSkill) {
    const declared = rowToSkill(existingSkill);
    await syncGitHubAfterSkillDeclare([{ id: declared.id, name: declared.name, domain: declared.domain }]);
    return declared;
  }

  const { data, error } = await supabase
    .from("declared_skills")
    .insert({
      user_id: userId,
      name: skill.name,
      domain: skill.domain || "General",
      description: skill.description || "",
      status: "Skill Claimed",
    })
    .select("*")
    .single();
  if (error) throw error;
  const declared = rowToSkill(data);
  const skillsForSync = allDeclaredSkills?.length
    ? [...allDeclaredSkills, declared]
    : [declared];
  await syncGitHubAfterSkillDeclare(
    skillsForSync.map((s) => ({ id: s.id, name: s.name, domain: s.domain })),
  );
  await syncDeclaredSkillEvidenceStatuses(userId);
  const { data: refreshed, error: refreshError } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId)
    .eq("id", declared.id)
    .maybeSingle();
  if (refreshError) throw refreshError;
  return refreshed ? rowToSkill(refreshed) : declared;
}

export async function fetchSkillRelatedEvidence(
  userId: string,
  skillId: string,
): Promise<RelatedEvidenceApiView[]> {
  const { data: repos, error } = await supabase
    .from("github_repos")
    .select("*")
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId)
    .order("last_updated", { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (repos ?? []).map((r) => ({
    id: r.id as string,
    source: "GitHub",
    status: "Mapped",
    repositoryName: r.repo_name as string,
    repositoryUrl: r.github_url as string,
    description: r.description as string | null,
    language: r.primary_language as string | null,
    stars: 0,
    forks: 0,
    lastUpdated: r.last_updated as string | null,
    commitCount: r.commit_count as number | null,
    suggestedSkillId: r.linked_skill_id as string | null,
    suggestedSkillName: r.linked_skill_name as string | null,
    mappingConfidence: "medium",
  }));
}

export async function deleteDeclaredSkill(userId: string, skillId: string): Promise<void> {
  const viaApi = await deleteSkillApi(skillId);
  if (viaApi) return;

  const { data: skill, error: fetchError } = await supabase
    .from("declared_skills")
    .select("id, name")
    .eq("user_id", userId)
    .eq("id", skillId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!skill) throw new Error("Competency not found");

  await cleanupCompetencyRelatedData(userId, skillId, skill.name as string);

  const { error } = await supabase
    .from("declared_skills")
    .delete()
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
}

/** Update competency name, domain, and description (E1-US3 edit). */
export async function updateDeclaredSkill(
  userId: string,
  skillId: string,
  skill: Pick<DeclaredSkill, "name" | "domain" | "description">,
): Promise<DeclaredSkill> {
  const { data, error } = await supabase
    .from("declared_skills")
    .update({
      name: skill.name.trim(),
      domain: skill.domain.trim() || "General",
      description: skill.description?.trim() ?? "",
    })
    .eq("user_id", userId)
    .eq("id", skillId)
    .select("*")
    .single();
  if (error) throw error;
  return rowToSkill(data);
}

export async function updateSkillPipelineStage(
  userId: string,
  skillId: string,
  pipelineStage: string,
  status?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    pipeline_stage: pipelineStage,
  };
  if (status) patch.status = status;

  const { error } = await supabase
    .from("declared_skills")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
}

export async function updateSkillActivityTimestamp(userId: string, skillId: string): Promise<void> {
  const { error } = await supabase
    .from("declared_skills")
    .update({ last_related_activity_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
}

export async function uploadSkillEvidenceFile(
  userId: string, skillId: string, file: File,
): Promise<string> {
  const ext  = file.name.split(".").pop();
  const path = `${userId}/${skillId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("skill-evidence").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("skill-evidence").getPublicUrl(path);
  return data.publicUrl;
}

export async function insertSkillSupportingRecord(
  userId: string, skillId: string, fileName: string, fileUrl: string,
): Promise<void> {
  const { error } = await supabase.from("supporting_records").insert({
    user_id: userId, skill_id: skillId, source: "Upload",
    title: fileName, url: fileUrl, occurred_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Submit evidence via Supabase (backend API disabled for localhost). */
export async function submitSkillEvidenceAfterUpload(
  userId: string,
  skillId: string,
  fileName: string,
  fileUrl: string,
): Promise<void> {
  await insertSkillSupportingRecord(userId, skillId, fileName, fileUrl);
  const { error } = await supabase.from("declared_skills")
    .update({
      status: "Evidence Linked",
      pipeline_stage: "evidence_linked",
      last_related_activity_at: new Date().toISOString(),
    })
    .eq("id", skillId).eq("user_id", userId);
  if (error) throw error;
}

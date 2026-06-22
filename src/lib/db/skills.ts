import { supabase } from "@/integrations/supabase/client";
import { createSkillApi, getRelatedEvidenceApi, type RelatedEvidenceApiView } from "@/services/api/skills.api";
import { submitEvidenceApi } from "@/services/api/evidence.api";
import { syncGitHubAfterSkillDeclare } from "@/lib/github-integration";
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

export async function fetchDeclaredSkills(userId: string): Promise<DeclaredSkill[]> {
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
  const viaApi = await createSkillApi(skill);
  if (viaApi) return viaApi.skill;

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
  return declared;
}

export async function fetchSkillRelatedEvidence(
  userId: string,
  skillId: string,
): Promise<RelatedEvidenceApiView[]> {
  const viaApi = await getRelatedEvidenceApi(skillId);
  if (viaApi) return viaApi.relatedEvidence;

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
  const { error } = await supabase
    .from("declared_skills")
    .delete()
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
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

/** Submit evidence via backend API when available, otherwise direct Supabase. */
export async function submitSkillEvidenceAfterUpload(
  userId: string,
  skillId: string,
  fileName: string,
  fileUrl: string,
): Promise<void> {
  const viaApi = await submitEvidenceApi({
    skillId,
    title: fileName,
    url: fileUrl,
    source: "Upload",
  });
  if (viaApi) return;

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

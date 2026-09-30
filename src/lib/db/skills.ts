import { supabase } from "@/integrations/supabase/client";
import type { RelatedEvidenceApiView } from "@/services/api/skills.api";
import { syncGitHubAfterSkillDeclare } from "@/lib/github-integration";
import { cleanupCompetencyRelatedData } from "@/lib/db/competency-cleanup";
import {
  applySkillEventApi,
  createSkillApi,
  deleteSkillApi,
  syncSkillEvidenceStatusApi,
  updateSkillApi,
} from "@/services/api/skills.api";
import { submitEvidenceApi } from "@/services/api/evidence.api";
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

export async function syncDeclaredSkillEvidenceStatuses(_userId: string): Promise<void> {
  await syncSkillEvidenceStatusApi();
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
  skill: Pick<DeclaredSkill, "name"> & Partial<Pick<DeclaredSkill, "domain" | "description">>,
  allDeclaredSkills?: DeclaredSkill[],
): Promise<DeclaredSkill> {
  const viaApi = await createSkillApi(skill);
  if (viaApi) {
    await syncGitHubAfterSkillDeclare(
      (allDeclaredSkills?.length ? [...allDeclaredSkills, viaApi.skill] : [viaApi.skill])
        .map((s) => ({ id: s.id, name: s.name, domain: s.domain })),
    );
    return viaApi.skill;
  }

  const normalizedName = skill.name.trim().toLowerCase();
  const { data: existing, error: existingError } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId);
  if (existingError) throw existingError;

  const existingSkill = (existing ?? []).find((row) =>
    String(row.name ?? "").trim().toLowerCase() === normalizedName,
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

/** Update competency name. Domain/description stay stored for compatibility. */
export async function updateDeclaredSkill(
  userId: string,
  skillId: string,
  skill: Pick<DeclaredSkill, "name"> & Partial<Pick<DeclaredSkill, "domain" | "description">>,
): Promise<DeclaredSkill> {
  const viaApi = await updateSkillApi(skillId, skill);
  if (viaApi) return viaApi;

  const patch: Record<string, unknown> = {
    name: skill.name.trim(),
  };
  if (skill.domain != null) patch.domain = skill.domain.trim() || "General";
  if (skill.description != null) patch.description = skill.description.trim();

  const { data, error } = await supabase
    .from("declared_skills")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", skillId)
    .select("*")
    .single();
  if (error) throw error;
  return rowToSkill(data);
}

export async function updateSkillPipelineStage(
  _userId: string,
  skillId: string,
  pipelineStage: string,
  _status?: string,
): Promise<void> {
  if (pipelineStage === "institution_attestation_pending") {
    const applied = await applySkillEventApi(skillId, "attestation_submitted");
    if (!applied) {
      throw new Error("Backend required to update attestation pipeline stage");
    }
    return;
  }

  if (pipelineStage === "evidence_linked" || pipelineStage === "declared") {
    const synced = await applySkillEventApi(skillId, "sync_evidence");
    if (!synced) {
      throw new Error("Backend required to update skill evidence pipeline stage");
    }
  }
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

/** Submit uploaded evidence; pipeline status is written only by the backend. */
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
}

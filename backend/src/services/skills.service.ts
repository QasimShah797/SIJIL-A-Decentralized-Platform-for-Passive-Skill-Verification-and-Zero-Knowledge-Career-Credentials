/**
 * Skill declaration business logic — CRUD on declared_skills table.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import {
  CreateSkillInput,
  DeclaredSkillWithEvidenceView,
  DeclaredSkillRow,
  RelatedEvidenceView,
  SkillView,
  UpdateSkillInput,
} from "../types/skills.types";
import { PIPELINE_STAGE, SKILL_STATUS } from "../constants/status";
import { githubSyncService } from "./github-sync.service";
import { evidenceRecordsService } from "./evidence-records.service";
import { evaluateSkillProjectMatch } from "../utils/evidence-matching";
import { cleanupCompetencyRelatedData } from "./competency-cleanup.service";

function parseBreakdown(row: Record<string, unknown>): Record<string, number> {
  const direct = row.language_breakdown;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, number>;
  }
  const meta = row.metadata as Record<string, unknown> | undefined;
  const fromMeta = meta?.language_breakdown;
  if (fromMeta && typeof fromMeta === "object" && !Array.isArray(fromMeta)) {
    return fromMeta as Record<string, number>;
  }
  return {};
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mappingConfidenceForEvidence(row: Record<string, unknown>, skill: SkillView): "high" | "medium" | "low" {
  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const result = evaluateSkillProjectMatch(
    { id: skill.id, name: skill.name, domain: skill.domain },
    {
      repositoryName: row.repository_name as string,
      repoFullName: (row.repo_full_name as string | null) ?? (metadata.full_name as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      primaryLanguage: (row.language as string | null) ?? null,
      languageBreakdown: parseBreakdown(row),
      topics: Array.isArray(metadata.topics) ? (metadata.topics as string[]) : [],
      dependencies: Array.isArray(metadata.dependencies) ? (metadata.dependencies as string[]) : [],
      metadata,
    },
  );
  return result.confidence;
}

function evidenceRowToView(
  row: Record<string, unknown>,
  skill: SkillView,
  matchReason?: string | null,
): RelatedEvidenceView {
  return {
    id: row.id as string,
    source: row.source as string,
    evidenceType: (row.evidence_type as string | null) ?? "Project Evidence",
    status: row.status as string,
    repositoryName: row.repository_name as string,
    repositoryUrl: row.repository_url as string,
    repoFullName: (row.repo_full_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    languageBreakdown: parseBreakdown(row),
    stars: Number(row.stars ?? 0),
    forks: Number(row.forks ?? 0),
    lastUpdated: (row.last_updated as string | null) ?? null,
    commitCount: row.commit_count != null ? Number(row.commit_count) : null,
    suggestedSkillId: (row.suggested_skill_id as string | null) ?? null,
    suggestedSkillName: (row.suggested_skill_name as string | null) ?? null,
    matchReason: matchReason ?? null,
    mappingConfidence: mappingConfidenceForEvidence(row, skill),
  };
}

function rowToView(row: DeclaredSkillRow): SkillView {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    description: row.description ?? "",
    status: row.status,
    pipelineStage: row.pipeline_stage ?? PIPELINE_STAGE.DECLARED,
    lastRelatedActivityAt: row.last_related_activity_at,
    lastCredentialSyncAt: row.last_credential_sync_at,
  };
}

export class SkillsService {
  async listByUser(userId: string): Promise<SkillView[]> {
    const { data, error } = await supabaseService.client
      .from("declared_skills")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => rowToView(row as DeclaredSkillRow));
  }

  async getById(userId: string, skillId: string): Promise<SkillView> {
    const { data, error } = await supabaseService.client
      .from("declared_skills")
      .select("*")
      .eq("user_id", userId)
      .eq("id", skillId)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError("Skill not found", 404);
    return rowToView(data as DeclaredSkillRow);
  }

  async create(userId: string, input: CreateSkillInput): Promise<DeclaredSkillWithEvidenceView> {
    const normalizedName = normalizeSkillKey(input.name);
    const domain = input.domain || "General";

    const { data: existingSkills, error: existingErr } = await supabaseService.client
      .from("declared_skills")
      .select("*")
      .eq("user_id", userId);

    if (existingErr) throw new AppError(existingErr.message, 500);

    const existing = (existingSkills ?? []).find((row) => {
      const sameName = normalizeSkillKey(String(row.name ?? "")) === normalizedName;
      const sameDomain = normalizeSkillKey(String(row.domain ?? "General")) === normalizeSkillKey(domain);
      return sameName && sameDomain;
    });

    let skill: SkillView;

    if (existing) {
      skill = rowToView(existing as DeclaredSkillRow);
    } else {
      const { data, error } = await supabaseService.client
        .from("declared_skills")
        .insert({
          user_id: userId,
          name: input.name,
          domain,
          description: input.description || "",
          status: SKILL_STATUS.CLAIMED,
          pipeline_stage: PIPELINE_STAGE.DECLARED,
        })
        .select("*")
        .single();

      if (error) throw new AppError(error.message, 500);
      skill = rowToView(data as DeclaredSkillRow);
    }

    try {
      await githubSyncService.sync(userId, await this.getSkillRefs(userId));
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 400 || error.statusCode === 401)) {
        // No GitHub connection or expired auth should not block skill declaration.
      } else {
        throw error;
      }
    }

    try {
      await evidenceRecordsService.autoLinkStrongMatchesForSkill(userId, skill.id);
    } catch {
      // Auto-link is best-effort when GitHub is unavailable.
    }

    return this.getSkillWithRelatedEvidence(userId, skill.id);
  }

  async update(userId: string, skillId: string, input: UpdateSkillInput): Promise<SkillView> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.domain !== undefined) patch.domain = input.domain;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.pipelineStage !== undefined) patch.pipeline_stage = input.pipelineStage;

    const { data, error } = await supabaseService.client
      .from("declared_skills")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", skillId)
      .select("*")
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError("Skill not found", 404);
    return rowToView(data as DeclaredSkillRow);
  }

  async delete(userId: string, skillId: string): Promise<void> {
    const { data: skill, error: fetchError } = await supabaseService.client
      .from("declared_skills")
      .select("id, name")
      .eq("user_id", userId)
      .eq("id", skillId)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500);
    if (!skill) throw new AppError("Skill not found", 404);

    await cleanupCompetencyRelatedData(userId, skillId, skill.name as string);

    const { error } = await supabaseService.client
      .from("declared_skills")
      .delete()
      .eq("user_id", userId)
      .eq("id", skillId);

    if (error) throw new AppError(error.message, 500);
  }

  async getSkillWithRelatedEvidence(
    userId: string,
    skillId: string,
  ): Promise<DeclaredSkillWithEvidenceView> {
    const skill = await this.getById(userId, skillId);

    const { data: links, error: linksErr } = await supabaseService.client
      .from("skill_evidence_links")
      .select("evidence_record_id, match_reason, evidence_records(*)")
      .eq("user_id", userId)
      .eq("skill_id", skillId);

    if (linksErr) throw new AppError(linksErr.message, 500);

    const relatedEvidence = (links ?? [])
      .map((link) => {
        const raw = link.evidence_records;
        const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
        if (!row) return null;
        return evidenceRowToView(row, skill, link.match_reason as string | null);
      })
      .filter((item): item is RelatedEvidenceView => item !== null);

    const evidenceStatus: DeclaredSkillWithEvidenceView["evidenceStatus"] =
      relatedEvidence.length > 0 ? "linked" : "none";

    return { skill, relatedEvidence, evidenceStatus };
  }

  async getSkillRefs(userId: string): Promise<Array<{ id: string; name: string; domain?: string }>> {
    const { data, error } = await supabaseService.client
      .from("declared_skills")
      .select("id, name, domain")
      .eq("user_id", userId);

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      domain: (row.domain as string | null) ?? undefined,
    }));
  }
}

export const skillsService = new SkillsService();

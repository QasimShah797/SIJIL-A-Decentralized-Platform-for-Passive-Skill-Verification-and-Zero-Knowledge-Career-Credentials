/**
 * Evidence submission and status management on supporting_records table.
 */
import { supabaseService } from "./supabase.service";
import { skillsService } from "./skills.service";
import { AppError } from "../utils/AppError";
import {
  EvidenceView,
  SubmitEvidenceInput,
  SupportingRecordRow,
} from "../types/evidence.types";
import { EVIDENCE_STATUS, PIPELINE_STAGE, SKILL_STATUS } from "../constants/status";

function rowToView(row: SupportingRecordRow, status: string = EVIDENCE_STATUS.PENDING): EvidenceView {
  return {
    id: row.id,
    skillId: row.skill_id ?? "",
    source: row.source,
    title: row.title,
    url: row.url,
    occurredAt: row.occurred_at,
    status,
  };
}

export class EvidenceService {
  async submit(userId: string, input: SubmitEvidenceInput): Promise<EvidenceView> {
    await skillsService.getById(userId, input.skillId);

    const { data, error } = await supabaseService.client
      .from("supporting_records")
      .insert({
        user_id: userId,
        skill_id: input.skillId,
        source: input.source || "Upload",
        title: input.title,
        url: input.url ?? null,
        occurred_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw new AppError(error.message, 500);

    await supabaseService.client
      .from("declared_skills")
      .update({
        status: SKILL_STATUS.EVIDENCE_LINKED,
        pipeline_stage: PIPELINE_STAGE.EVIDENCE_LINKED,
        last_related_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", input.skillId);

    return rowToView(data as SupportingRecordRow, EVIDENCE_STATUS.PENDING);
  }

  async listBySkill(userId: string, skillId: string): Promise<EvidenceView[]> {
    const { data, error } = await supabaseService.client
      .from("supporting_records")
      .select("*")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .order("occurred_at", { ascending: false });

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => rowToView(row as SupportingRecordRow));
  }

  async updateStatus(
    userId: string,
    evidenceId: string,
    status: string,
  ): Promise<EvidenceView> {
    const { data: existing, error: fetchErr } = await supabaseService.client
      .from("supporting_records")
      .select("*")
      .eq("id", evidenceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) throw new AppError(fetchErr.message, 500);
    if (!existing) throw new AppError("Evidence not found", 404);

    return rowToView(existing as SupportingRecordRow, status);
  }
}

export const evidenceService = new EvidenceService();

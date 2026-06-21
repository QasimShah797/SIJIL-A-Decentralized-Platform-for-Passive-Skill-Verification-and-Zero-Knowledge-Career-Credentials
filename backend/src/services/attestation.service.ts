/**
 * Institution attestation queue and decision workflow.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import { ATTESTATION_STATUS, PIPELINE_STAGE, SKILL_STATUS } from "../constants/status";

export interface AttestationRecord {
  id: string;
  learnerUserId: string;
  student: string;
  studentId: string;
  program: string;
  batch: string;
  email: string;
  skillId: string;
  skill: string;
  validationResult: string;
  validationStatus: string;
  lastEvaluated: string;
  evidenceCount: number;
  reviewCount: number;
  readiness: string;
  status: string;
  submittedAt: string;
  remarks?: string;
}

function rowToRecord(row: Record<string, unknown>): AttestationRecord {
  return {
    id: row.id as string,
    learnerUserId: row.learner_user_id as string,
    student: (row.student_name as string) ?? "—",
    studentId: (row.student_id as string) ?? "—",
    program: (row.program as string) ?? "—",
    batch: (row.batch as string) ?? "—",
    email: (row.email as string) ?? "—",
    skillId: (row.skill_id as string) ?? "",
    skill: row.skill_name as string,
    validationResult: row.validation_result as string,
    validationStatus: row.validation_status as string,
    lastEvaluated: (row.last_evaluated as string) ?? "—",
    evidenceCount: (row.evidence_count as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    readiness: row.readiness as string,
    status: row.status as string,
    submittedAt: (row.submitted_at as string) ?? "—",
    remarks: row.remarks as string | undefined,
  };
}

async function updateSkillAfterDecision(
  learnerUserId: string,
  skillId: string,
  approved: boolean,
): Promise<void> {
  if (!learnerUserId || !skillId) return;

  const patch = approved
    ? {
        pipeline_stage: PIPELINE_STAGE.WALLET_READY,
        status: SKILL_STATUS.WALLET_READY,
      }
    : {
        pipeline_stage: PIPELINE_STAGE.INSTITUTION_REJECTED,
        status: "institution_attestation_rejected",
      };

  await supabaseService.client
    .from("declared_skills")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", learnerUserId)
    .eq("id", skillId);
}

export class AttestationService {
  async getQueue(): Promise<AttestationRecord[]> {
    const { data, error } = await supabaseService.client
      .from("attestations")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => rowToRecord(row));
  }

  async approve(id: string, remarks?: string): Promise<AttestationRecord> {
    return this.decide(id, ATTESTATION_STATUS.APPROVED, "Ready for Credential Issuance", remarks, true);
  }

  async reject(id: string, remarks?: string): Promise<AttestationRecord> {
    return this.decide(id, ATTESTATION_STATUS.REJECTED, undefined, remarks, false);
  }

  async requestClarification(id: string, remarks?: string): Promise<AttestationRecord> {
    return this.decide(id, ATTESTATION_STATUS.CLARIFICATION, undefined, remarks, false);
  }

  private async decide(
    id: string,
    status: string,
    readiness: string | undefined,
    remarks: string | undefined,
    approved: boolean,
  ): Promise<AttestationRecord> {
    const { data: existing, error: fetchErr } = await supabaseService.client
      .from("attestations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw new AppError(fetchErr.message, 500);
    if (!existing) throw new AppError("Attestation not found", 404);

    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (readiness) patch.readiness = readiness;
    if (remarks !== undefined) patch.remarks = remarks;

    const { data, error } = await supabaseService.client
      .from("attestations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new AppError(error.message, 500);

    if (status === ATTESTATION_STATUS.APPROVED || status === ATTESTATION_STATUS.REJECTED) {
      await updateSkillAfterDecision(
        existing.learner_user_id as string,
        existing.skill_id as string,
        approved,
      );
    }

    return rowToRecord(data);
  }
}

export const attestationService = new AttestationService();

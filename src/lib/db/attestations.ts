import { supabase } from "@/integrations/supabase/client";
import {
  approveAttestationApi,
  rejectAttestationApi,
  clarificationAttestationApi,
} from "@/services/api/attestation.api";
import type { LearnerProfileView } from "@/lib/db/learner-profile";
import { updateSkillPipelineStage } from "@/lib/db/skills";
import { issueCredentialForSkill } from "@/lib/db/credentials";
import type { AttestationRecord, AttestationStatus } from "@/lib/sijil-data";
import type { SkillTask } from "@/lib/sijil-data";

function rowToAttestation(row: Record<string, unknown>): AttestationRecord {
  const task = (row.task as AttestationRecord["task"]) ?? {
    title: "Practical task",
    relatedSkill: row.skill_name as string,
    attemptId: "—",
    submissionType: "Manual" as const,
    submittedAt: "—",
    reviewStatus: "Pending",
    artifactSummary: "—",
  };

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
    validationResult: row.validation_result as AttestationRecord["validationResult"],
    validationStatus: row.validation_status as AttestationRecord["validationStatus"],
    lastEvaluated: (row.last_evaluated as string) ?? "—",
    evidenceCount: (row.evidence_count as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    readiness: row.readiness as AttestationRecord["readiness"],
    status: row.status as AttestationStatus,
    submittedAt: (row.submitted_at as string) ?? "—",
    remarks: row.remarks as string | undefined,
    source: row.source as string | undefined,
    institutionName: row.institution_name as string | undefined,
    practicalScore: row.practical_score != null ? Number(row.practical_score) : undefined,
    practicalFeedback: row.practical_feedback as string | undefined,
    evidence: (row.evidence as AttestationRecord["evidence"]) ?? [],
    task,
    reviews: (row.reviews as AttestationRecord["reviews"]) ?? [],
  };
}

export async function fetchAttestations(): Promise<AttestationRecord[]> {
  const { data, error } = await supabase
    .from("attestations")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAttestation);
}

export async function fetchAttestationForSkill(
  learnerUserId: string,
  skillId: string,
): Promise<AttestationRecord | null> {
  const { data, error } = await supabase
    .from("attestations")
    .select("*")
    .eq("learner_user_id", learnerUserId)
    .eq("skill_id", skillId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAttestation(data) : null;
}

export async function updateAttestationDb(id: string, patch: Partial<AttestationRecord>): Promise<void> {
  if (patch.status === "Attestation Approved") {
    const viaApi = await approveAttestationApi(id, patch.remarks);
    if (viaApi) return;
  } else if (patch.status === "Attestation Rejected" && patch.remarks) {
    const viaApi = await rejectAttestationApi(id, patch.remarks);
    if (viaApi) return;
  } else if (patch.status === "Needs Clarification" && patch.remarks) {
    const viaApi = await clarificationAttestationApi(id, patch.remarks);
    if (viaApi) return;
  }

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.remarks !== undefined) dbPatch.remarks = patch.remarks;
  if (patch.readiness !== undefined) dbPatch.readiness = patch.readiness;
  if (patch.validationResult !== undefined) dbPatch.validation_result = patch.validationResult;
  if (patch.validationStatus !== undefined) dbPatch.validation_status = patch.validationStatus;

  const { data: existing, error: fetchErr } = await supabase
    .from("attestations")
    .select("learner_user_id, skill_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const { error } = await supabase.from("attestations").update(dbPatch).eq("id", id);
  if (error) throw error;

  if (existing?.learner_user_id && existing?.skill_id && patch.status) {
    if (patch.status === "Attestation Approved") {
      await updateSkillPipelineStage(
        existing.learner_user_id as string,
        existing.skill_id as string,
        "wallet_ready",
        "Wallet Ready",
      );
      try {
        await issueCredentialForSkill(
          existing.learner_user_id as string,
          existing.skill_id as string,
        );
      } catch (issueErr) {
        console.error("Auto credential issuance failed:", issueErr);
      }
    } else if (patch.status === "Attestation Rejected") {
      await updateSkillPipelineStage(
        existing.learner_user_id as string,
        existing.skill_id as string,
        "institution_attestation_rejected",
        "institution_attestation_rejected",
      );
    }
  }
}

export async function createAttestationFromLearner(
  learnerUserId: string,
  profile: { name: string; studentId: string; program: string; batch: string; email: string },
  skill: { id: string; name: string },
  evidenceCount: number,
  reviewCount: number,
): Promise<void> {
  const { error } = await supabase.from("attestations").insert({
    learner_user_id: learnerUserId,
    skill_id: skill.id,
    skill_name: skill.name,
    student_name: profile.name,
    student_id: profile.studentId,
    program: profile.program,
    batch: profile.batch,
    email: profile.email,
    validation_result: evidenceCount > 0 ? "Passed" : "Pending",
    validation_status: evidenceCount > 0 ? "Validated" : "Under Review",
    last_evaluated: new Date().toISOString().slice(0, 10),
    evidence_count: evidenceCount,
    review_count: reviewCount,
    readiness: evidenceCount >= 3 ? "Ready for Attestation" : "Pending Evidence",
    status: "Pending Attestation",
    submitted_at: new Date().toISOString().slice(0, 10),
    evidence: [],
    reviews: [],
  });
  if (error) throw error;
}

export async function createAttestationFromPracticalPass(params: {
  learnerUserId: string;
  profile: LearnerProfileView;
  skill: { id: string; name: string };
  task: SkillTask | null;
  attemptId: string;
  score: number;
  feedback: string;
}): Promise<void> {
  const institution = params.profile.institution?.trim() || "CUST";
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("attestations").insert({
    learner_user_id: params.learnerUserId,
    skill_id: params.skill.id,
    skill_name: params.skill.name,
    student_name: params.profile.name,
    student_id: params.profile.studentId,
    program: params.profile.program,
    batch: params.profile.batch,
    email: params.profile.email,
    institution_name: institution,
    source: "practical_task_passed",
    validation_result: "Passed",
    validation_status: "Validated",
    last_evaluated: today,
    evidence_count: 1,
    review_count: 0,
    readiness: "Pending Institution Attestation",
    status: "Pending Attestation",
    submitted_at: today,
    practical_score: params.score,
    practical_feedback: params.feedback,
    evidence: [
      {
        id: `pt-${params.attemptId}`,
        name: params.task?.title ?? "Practical task passed",
        type: "Practical Submission",
        date: today,
        role: "Primary evidence",
        status: "Passed",
      },
    ],
    task: {
      title: params.task?.title ?? "Practical task",
      relatedSkill: params.skill.name,
      attemptId: params.attemptId,
      submissionType: "Manual",
      submittedAt: new Date().toLocaleString(),
      reviewStatus: "Passed",
      artifactSummary: params.feedback,
    },
    reviews: [],
  });
  if (error) throw error;
}

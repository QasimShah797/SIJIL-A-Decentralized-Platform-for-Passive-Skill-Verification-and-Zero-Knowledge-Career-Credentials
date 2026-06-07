import { supabase } from "@/integrations/supabase/client";
import type { AttestationRecord, AttestationStatus } from "@/lib/sijil-data";

function rowToAttestation(row: Record<string, unknown>): AttestationRecord {
  return {
    id: row.id as string,
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
    evidence: (row.evidence as AttestationRecord["evidence"]) ?? [],
    task: row.task as AttestationRecord["task"],
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

export async function updateAttestationDb(id: string, patch: Partial<AttestationRecord>): Promise<void> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.remarks !== undefined) dbPatch.remarks = patch.remarks;
  if (patch.readiness !== undefined) dbPatch.readiness = patch.readiness;
  if (patch.validationResult !== undefined) dbPatch.validation_result = patch.validationResult;
  if (patch.validationStatus !== undefined) dbPatch.validation_status = patch.validationStatus;

  const { error } = await supabase.from("attestations").update(dbPatch).eq("id", id);
  if (error) throw error;
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

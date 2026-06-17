import { supabase } from "@/integrations/supabase/client";
import type { LearnerProfileView } from "@/lib/db/learner-profile";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import { updateSkillPipelineStage } from "@/lib/db/skills";
import { institutionDisplayName, normalizeInstitutionName } from "@/lib/institution-routing";
import type { AttemptRecord, DeclaredSkill, SkillTask } from "@/lib/sijil-data";

export type PracticalTaskResult = {
  attemptId: string;
  title: string;
  status: "Passed" | "Failed";
  feedback: string;
  submission?: string;
  criteriaResults: Record<string, unknown>[];
  submittedAt: string;
};

export type EvidencePackage = {
  learner: {
    id: string;
    name: string;
    email: string;
    institution: string;
    studentId?: string;
    program?: string;
    batch?: string;
  };
  competency: {
    id: string;
    name: string;
    domain: string;
    declaredAt?: string;
  };
  evidence: {
    github: Record<string, unknown>[];
    moodle: Record<string, unknown>[];
    certificates: Record<string, unknown>[];
    peerReviews: Record<string, unknown>[];
  };
  practicalTask: PracticalTaskResult;
  attestation: {
    institutionName: string;
    status: string;
    stage: string;
    approvedAt?: string;
    rejectedAt?: string;
    feedback?: string;
    message?: string;
  };
  timestamp: string;
  /** Internal evaluation metadata — never render in UI */
  _internal?: {
    score?: number;
  };
};

export type InstitutionAttestationRequest = {
  id: string;
  learnerUserId: string;
  learnerName: string;
  learnerEmail: string;
  skillId: string;
  competencyName: string;
  competencyDomain: string;
  institutionName: string;
  institutionId?: string;
  status: "pending" | "approved" | "rejected";
  currentStage: string;
  evidencePackage: EvidencePackage;
  practicalTaskResult: PracticalTaskResult;
  githubEvidence: Record<string, unknown>[];
  moodleEvidence: Record<string, unknown>[];
  certificateEvidence: Record<string, unknown>[];
  peerReviewEvidence: Record<string, unknown>[];
  submittedToInstitutionAt: string;
  reviewedAt?: string;
  institutionFeedback?: string;
};

type EvaluationResult = {
  passed: boolean;
  score?: number;
  feedback: string;
  criteriaResults?: Record<string, unknown>[];
};

export function resolveCompetencyName(request: InstitutionAttestationRequest): string {
  return (
    request.competencyName
    || request.evidencePackage?.competency?.name
    || "Competency not found"
  );
}

export function resolveCompetencyDomain(request: InstitutionAttestationRequest): string {
  return (
    request.competencyDomain
    || request.evidencePackage?.competency?.domain
    || "Not specified"
  );
}

export function resolvePracticalTaskStatus(result?: PracticalTaskResult | null): "Passed" | "Failed" | "Unknown" {
  if (!result) return "Unknown";
  if (result.status) return result.status;
  return "Unknown";
}

export function evidencePackageForDisplay(pkg: EvidencePackage): EvidencePackage {
  const copy = JSON.parse(JSON.stringify(pkg)) as EvidencePackage & { practicalTask?: { score?: number; passed?: boolean } };
  if (copy._internal) delete copy._internal;
  if (copy.practicalTask && "score" in copy.practicalTask) {
    delete (copy.practicalTask as { score?: number }).score;
  }
  if (copy.practicalTask && "passed" in copy.practicalTask) {
    delete (copy.practicalTask as { passed?: boolean }).passed;
  }
  return copy;
}

function normalizePracticalTaskResult(raw: Record<string, unknown> | null | undefined): PracticalTaskResult {
  const passed = raw?.passed === true;
  const status = (raw?.status as PracticalTaskResult["status"])
    ?? (passed ? "Passed" : "Failed");

  return {
    attemptId: (raw?.attemptId as string) ?? "",
    title: (raw?.title as string) ?? "Practical task",
    status,
    feedback: (raw?.feedback as string) ?? "",
    submission: raw?.submission as string | undefined,
    criteriaResults: (raw?.criteriaResults as Record<string, unknown>[]) ?? [],
    submittedAt: (raw?.submittedAt as string) ?? "",
  };
}

function rowToRequest(row: Record<string, unknown>): InstitutionAttestationRequest {
  const evidencePackage = (row.evidence_package as EvidencePackage) ?? {
    learner: { id: "", name: "", email: "", institution: "" },
    competency: { id: "", name: "", domain: "" },
    evidence: { github: [], moodle: [], certificates: [], peerReviews: [] },
    practicalTask: {
      attemptId: "",
      title: "",
      status: "Failed",
      feedback: "",
      criteriaResults: [],
      submittedAt: "",
    },
    attestation: { institutionName: "", status: "pending", stage: "institution_attestation_pending" },
    timestamp: "",
  };

  const practicalTaskResult = normalizePracticalTaskResult(
    (row.practical_task_result as Record<string, unknown>) ?? evidencePackage.practicalTask,
  );

  return {
    id: row.id as string,
    learnerUserId: row.learner_user_id as string,
    learnerName: (row.learner_name as string) ?? evidencePackage.learner.name ?? "",
    learnerEmail: (row.learner_email as string) ?? evidencePackage.learner.email ?? "",
    skillId: (row.skill_id as string) ?? evidencePackage.competency.id ?? "",
    competencyName: (row.competency_name as string) || evidencePackage.competency.name || "",
    competencyDomain: (row.competency_domain as string) || evidencePackage.competency.domain || "",
    institutionName: (row.institution_name as string) || evidencePackage.attestation.institutionName || "",
    institutionId: row.institution_id as string | undefined,
    status: row.status as InstitutionAttestationRequest["status"],
    currentStage: (row.current_stage as string) ?? "institution_attestation_pending",
    evidencePackage,
    practicalTaskResult,
    githubEvidence: (row.github_evidence as Record<string, unknown>[]) ?? evidencePackage.evidence.github ?? [],
    moodleEvidence: (row.moodle_evidence as Record<string, unknown>[]) ?? evidencePackage.evidence.moodle ?? [],
    certificateEvidence: (row.certificate_evidence as Record<string, unknown>[]) ?? evidencePackage.evidence.certificates ?? [],
    peerReviewEvidence: (row.peer_review_evidence as Record<string, unknown>[]) ?? evidencePackage.evidence.peerReviews ?? [],
    submittedToInstitutionAt: row.submitted_to_institution_at as string,
    reviewedAt: row.reviewed_at as string | undefined,
    institutionFeedback: row.institution_feedback as string | undefined,
  };
}

async function fetchSkillEvidence(userId: string, skillId: string, skillName: string) {
  const [ghActs, ghRepos, lmsEv, certs, reviews] = await Promise.all([
    supabase
      .from("github_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId)
      .limit(20),
    supabase
      .from("lms_evidence")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId)
      .order("fetched_at", { ascending: false })
      .limit(50),
    supabase
      .from("supporting_records")
      .select("*")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .order("occurred_at", { ascending: false }),
    fetchPeerReviews(userId),
  ]);

  const github = [
    ...(ghActs.data ?? []),
    ...(ghRepos.data ?? []),
  ] as Record<string, unknown>[];

  const moodle = (lmsEv.data ?? []) as Record<string, unknown>[];
  const certificates = (certs.data ?? []) as Record<string, unknown>[];
  const peerReviewEvidence = reviews
    .filter((r) => r.skill === skillName)
    .map((r) => ({
      id: r.id,
      reviewerName: r.reviewerName,
      reviewerRole: r.reviewerRole,
      skill: r.skill,
      rating: r.rating,
      comment: r.comment,
      recommendation: r.recommendation,
      date: r.date,
      evidenceLabel: r.evidenceLabel,
      evidenceUrl: r.evidenceUrl,
    })) as Record<string, unknown>[];

  return { github, moodle, certificates, peerReviews: peerReviewEvidence };
}

export async function buildEvidencePackage(params: {
  userId: string;
  userEmail: string;
  profile: LearnerProfileView;
  skill: DeclaredSkill & { createdAt?: string };
  task: SkillTask | null;
  attempt: AttemptRecord;
  submission: string;
  evaluation: EvaluationResult;
}): Promise<EvidencePackage> {
  const learnerInstitution = institutionDisplayName(
    params.profile.institution !== "—" ? params.profile.institution : undefined,
  );
  const evidence = await fetchSkillEvidence(params.userId, params.skill.id, params.skill.name);
  const now = new Date().toISOString();

  console.log("GitHub evidence for attestation:", evidence.github);
  console.log("Moodle evidence for attestation:", evidence.moodle);
  console.log("Peer review evidence for attestation:", evidence.peerReviews);
  console.log("Certificate evidence for attestation:", evidence.certificates);

  return {
    learner: {
      id: params.userId,
      name: params.profile.name,
      email: params.userEmail,
      institution: learnerInstitution,
      studentId: params.profile.studentId,
      program: params.profile.program,
      batch: params.profile.batch,
    },
    competency: {
      id: params.skill.id,
      name: params.skill.name,
      domain: params.skill.domain,
      declaredAt: params.skill.createdAt,
    },
    evidence,
    practicalTask: {
      attemptId: params.attempt.attemptId,
      title: params.task?.title ?? "Practical task",
      status: params.evaluation.passed ? "Passed" : "Failed",
      feedback: params.evaluation.feedback,
      submission: params.submission,
      criteriaResults: params.evaluation.criteriaResults ?? [],
      submittedAt: now,
    },
    attestation: {
      institutionName: learnerInstitution,
      status: "pending",
      stage: "institution_attestation_pending",
    },
    timestamp: now,
    _internal: params.evaluation.score != null ? { score: params.evaluation.score } : undefined,
  };
}

export async function createInstitutionAttestationRequest(params: {
  userId: string;
  userEmail: string;
  profile: LearnerProfileView;
  skill: DeclaredSkill & { createdAt?: string };
  task: SkillTask | null;
  attempt: AttemptRecord;
  submission: string;
  evaluation: EvaluationResult;
}): Promise<InstitutionAttestationRequest> {
  console.log("Learner profile for attestation:", params.profile);
  console.log("Skill for attestation:", params.skill);

  const evidencePackage = await buildEvidencePackage(params);
  const institutionName = normalizeInstitutionName(params.profile.institution);

  const { data: institutionProfile } = await supabase
    .from("institution_profiles")
    .select("user_id, institution_name")
    .ilike("institution_name", "%capital%")
    .limit(1)
    .maybeSingle();

  const attestationPayload = {
    learner_user_id: params.userId,
    learner_name: params.profile.name,
    learner_email: params.userEmail,
    skill_id: params.skill.id,
    competency_name: params.skill.name,
    competency_domain: params.skill.domain,
    institution_name: institutionName,
    institution_id: institutionProfile?.user_id ?? null,
    status: "pending",
    current_stage: "institution_attestation_pending",
    evidence_package: evidencePackage,
    practical_task_result: evidencePackage.practicalTask,
    github_evidence: evidencePackage.evidence.github,
    moodle_evidence: evidencePackage.evidence.moodle,
    certificate_evidence: evidencePackage.evidence.certificates,
    peer_review_evidence: evidencePackage.evidence.peerReviews,
  };

  console.log("Institution attestation payload:", attestationPayload);

  const { data, error } = await supabase
    .from("institution_attestation_requests")
    .insert(attestationPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Institution attestation insert error:", error);
    throw error;
  }

  await updateSkillPipelineStage(
    params.userId,
    params.skill.id,
    "institution_attestation_pending",
    "pending_institution_attestation",
  );

  return rowToRequest(data);
}

export async function fetchAttestationRequestForSkill(
  learnerUserId: string,
  skillId: string,
): Promise<InstitutionAttestationRequest | null> {
  const { data, error } = await supabase
    .from("institution_attestation_requests")
    .select("*")
    .eq("learner_user_id", learnerUserId)
    .eq("skill_id", skillId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToRequest(data) : null;
}

export async function fetchInstitutionAttestationRequests(): Promise<InstitutionAttestationRequest[]> {
  const { data, error } = await supabase
    .from("institution_attestation_requests")
    .select("*")
    .order("submitted_to_institution_at", { ascending: false });

  if (error) {
    console.error("Institution attestation fetch error:", error);
    throw error;
  }
  return (data ?? []).map(rowToRequest);
}

export async function fetchInstitutionAttestationRequest(
  id: string,
): Promise<InstitutionAttestationRequest | null> {
  const { data, error } = await supabase
    .from("institution_attestation_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToRequest(data) : null;
}

export async function updateInstitutionAttestationRequest(
  id: string,
  patch: {
    status: "approved" | "rejected";
    institutionFeedback?: string;
    reviewedBy?: string;
  },
): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from("institution_attestation_requests")
    .select("learner_user_id, skill_id, evidence_package")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error("Attestation request not found");

  const stage = patch.status === "approved" ? "wallet_ready" : "institution_attestation_rejected";
  const now = new Date().toISOString();
  const evidencePackage = existing.evidence_package as EvidencePackage;
  const updatedPackage: EvidencePackage = {
    ...evidencePackage,
    attestation: {
      ...evidencePackage.attestation,
      status: patch.status,
      stage,
      ...(patch.status === "approved"
        ? { approvedAt: now, message: "Institution attestation approved." }
        : { rejectedAt: now, feedback: patch.institutionFeedback }),
    },
  };

  const { error } = await supabase
    .from("institution_attestation_requests")
    .update({
      status: patch.status,
      current_stage: stage,
      institution_feedback: patch.institutionFeedback ?? null,
      reviewed_at: now,
      reviewed_by: patch.reviewedBy ?? null,
      evidence_package: updatedPackage,
      updated_at: now,
    })
    .eq("id", id);

  if (error) throw error;

  if (existing.learner_user_id && existing.skill_id) {
    if (patch.status === "approved") {
      await updateSkillPipelineStage(
        existing.learner_user_id as string,
        existing.skill_id as string,
        "wallet_ready",
        "wallet_ready",
      );
    } else {
      await updateSkillPipelineStage(
        existing.learner_user_id as string,
        existing.skill_id as string,
        "institution_attestation_rejected",
        "institution_attestation_rejected",
      );
    }
  }
}

export async function hasPendingAttestationRequest(
  learnerUserId: string,
  skillId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("institution_attestation_requests")
    .select("id")
    .eq("learner_user_id", learnerUserId)
    .eq("skill_id", skillId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

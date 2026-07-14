import { supabase } from "@/integrations/supabase/client";
import type { LearnerProfileView } from "@/lib/db/learner-profile";
import { fetchPeerReviews, rowToReview } from "@/lib/db/peer-reviews";
import { updateSkillPipelineStage } from "@/lib/db/skills";
import { issueCredentialForSkill } from "@/lib/db/credentials";
import { institutionDisplayName, normalizeInstitutionName } from "@/lib/institution-routing";
import type { AttemptRecord, DeclaredSkill, SkillTask } from "@/lib/sijil-data";

export type PracticalTaskResult = {
  attemptId: string;
  title: string;
  status: "Passed" | "Failed";
  feedback: string;
  summary?: string;
  scorePercent?: number;
  correctCount?: number;
  totalQuestions?: number;
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
  mcqResult?: Record<string, unknown>;
  testPercentage?: number;
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
  summary?: string;
  correctCount?: number;
  totalQuestions?: number;
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

export function resolveLearnerName(request: InstitutionAttestationRequest): string {
  return (
    request.learnerName?.trim()
    || request.evidencePackage?.learner?.name?.trim()
    || "Learner"
  );
}

export function resolveLearnerEmail(request: InstitutionAttestationRequest): string {
  return (
    request.learnerEmail?.trim()
    || request.evidencePackage?.learner?.email?.trim()
    || "No email available"
  );
}

export function resolveMcqPercentage(request: InstitutionAttestationRequest): number | null {
  if (request.testPercentage != null && Number.isFinite(request.testPercentage)) {
    return request.testPercentage;
  }

  const mcqPercentage = request.mcqResult?.percentage;
  if (mcqPercentage != null && Number.isFinite(Number(mcqPercentage))) {
    return Number(mcqPercentage);
  }

  if (request.practicalTaskResult?.scorePercent != null) {
    return request.practicalTaskResult.scorePercent;
  }

  const rawResult = request.practicalTaskResult as unknown as Record<string, unknown> | undefined;
  if (rawResult?.percentage != null && Number.isFinite(Number(rawResult.percentage))) {
    return Number(rawResult.percentage);
  }

  return null;
}

export function formatMcqPercentageLabel(request: InstitutionAttestationRequest): string {
  const percentage = resolveMcqPercentage(request);
  return percentage != null ? `${percentage}%` : "Not available";
}

export type InstitutionStudentSummary = {
  id: string;
  name: string;
  email: string;
  competency: string;
  domain: string;
  status: string;
  percentage: number | null;
  submittedAt: string;
};

export function deriveInstitutionStudents(
  requests: InstitutionAttestationRequest[],
): InstitutionStudentSummary[] {
  const byLearner = new Map<string, InstitutionStudentSummary>();

  for (const request of requests) {
    const learnerId = request.learnerUserId || request.id;
    const next: InstitutionStudentSummary = {
      id: learnerId,
      name: resolveLearnerName(request),
      email: resolveLearnerEmail(request),
      competency: resolveCompetencyName(request),
      domain: resolveCompetencyDomain(request),
      status: request.status,
      percentage: resolveMcqPercentage(request),
      submittedAt: request.submittedToInstitutionAt || "",
    };

    const existing = byLearner.get(learnerId);
    if (!existing) {
      byLearner.set(learnerId, next);
      continue;
    }

    const existingTime = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
    const nextTime = next.submittedAt ? new Date(next.submittedAt).getTime() : 0;
    if (nextTime >= existingTime) {
      byLearner.set(learnerId, next);
    }
  }

  return Array.from(byLearner.values()).sort((a, b) => {
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function safeEvidenceCount(items: unknown): number {
  return Array.isArray(items) ? items.length : 0;
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
  const scorePercent = raw?.scorePercent != null
    ? Number(raw.scorePercent)
    : raw?.percentage != null
      ? Number(raw.percentage)
      : raw?.score != null
        ? Number(raw.score)
        : undefined;

  const passed = raw?.passed === true || (scorePercent != null && scorePercent >= 70);
  const status = (raw?.status as PracticalTaskResult["status"])
    ?? (passed ? "Passed" : "Failed");

  return {
    attemptId: (raw?.attemptId as string) ?? "",
    title: (raw?.title as string) ?? "Practical task",
    status,
    feedback: (raw?.feedback as string) ?? "",
    summary: (raw?.summary as string) ?? undefined,
    scorePercent: Number.isFinite(scorePercent) ? scorePercent : undefined,
    correctCount: raw?.correctCount != null ? Number(raw.correctCount) : undefined,
    totalQuestions: raw?.totalQuestions != null ? Number(raw.totalQuestions) : undefined,
    submission: raw?.submission as string | undefined,
    criteriaResults: (raw?.criteriaResults as Record<string, unknown>[]) ?? [],
    submittedAt: (raw?.submittedAt as string) ?? "",
  };
}

function rowToRequest(row: Record<string, unknown>): InstitutionAttestationRequest {
  const rawPackage = row.evidence_package as Record<string, unknown> | null | undefined;
  const evidencePackage = (rawPackage as EvidencePackage | undefined) ?? {
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

  const githubEvidence = Array.isArray(row.github_evidence)
    ? row.github_evidence as Record<string, unknown>[]
    : Array.isArray(evidencePackage.evidence?.github)
      ? evidencePackage.evidence.github
      : rawPackage?.githubEvidence
        ? [rawPackage.githubEvidence as Record<string, unknown>]
        : [];

  const moodleEvidence = Array.isArray(row.moodle_evidence)
    ? row.moodle_evidence as Record<string, unknown>[]
    : Array.isArray(evidencePackage.evidence?.moodle)
      ? evidencePackage.evidence.moodle
      : [];

  const certificateEvidence = Array.isArray(row.certificate_evidence)
    ? row.certificate_evidence as Record<string, unknown>[]
    : Array.isArray(evidencePackage.evidence?.certificates)
      ? evidencePackage.evidence.certificates
      : [];

  const peerReviewEvidence = Array.isArray(row.peer_review_evidence)
    ? row.peer_review_evidence as Record<string, unknown>[]
    : Array.isArray(evidencePackage.evidence?.peerReviews)
      ? evidencePackage.evidence.peerReviews
      : [];

  const practicalTaskResult = normalizePracticalTaskResult(
    (row.practical_task_result as Record<string, unknown>) ?? evidencePackage.practicalTask,
  );
  const testPercentage = row.test_percentage != null
    ? Number(row.test_percentage)
    : practicalTaskResult.scorePercent;
  if (testPercentage != null && practicalTaskResult.scorePercent == null) {
    practicalTaskResult.scorePercent = testPercentage;
  }

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
    mcqResult: row.mcq_result as Record<string, unknown> | undefined,
    testPercentage,
    githubEvidence,
    moodleEvidence,
    certificateEvidence,
    peerReviewEvidence,
    submittedToInstitutionAt: (row.submitted_to_institution_at as string)
      || (row.created_at as string)
      || "",
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

  const { data: reviewsBySkillId } = await supabase
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .eq("skill_id", skillId);

  const mergedReviews = new Map<string, ReturnType<typeof rowToReview>>();
  for (const row of reviewsBySkillId ?? []) {
    mergedReviews.set(row.id as string, rowToReview(row as Record<string, unknown>));
  }
  for (const review of reviews.filter((r) => r.skill.trim().toLowerCase() === skillName.trim().toLowerCase())) {
    mergedReviews.set(review.id, review);
  }

  const github = [
    ...(ghActs.data ?? []),
    ...(ghRepos.data ?? []),
  ] as Record<string, unknown>[];

  const moodle = (lmsEv.data ?? []) as Record<string, unknown>[];
  const certificates = (certs.data ?? []) as Record<string, unknown>[];
  const peerReviewEvidence = Array.from(mergedReviews.values())
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
      summary: params.evaluation.summary,
      scorePercent: params.evaluation.score,
      correctCount: params.evaluation.correctCount,
      totalQuestions: params.evaluation.totalQuestions,
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
    .order("created_at", { ascending: false });

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
      try {
        await issueCredentialForSkill(
          existing.learner_user_id as string,
          existing.skill_id as string,
        );
      } catch (issueErr) {
        console.error("Auto credential issuance failed:", issueErr);
      }
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

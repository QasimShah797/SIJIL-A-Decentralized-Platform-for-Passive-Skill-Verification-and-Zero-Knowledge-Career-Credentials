import { supabase } from "@/integrations/supabase/client";
import type { DeclaredSkill } from "@/lib/sijil-data";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import { fetchAttempt } from "@/lib/db/practical-attempts";
import { fetchAttestationRequestForSkill } from "@/lib/db/institution-attestation-requests";
import { institutionDisplayName } from "@/lib/institution-routing";
import { fetchLearnerProfile } from "@/lib/db/learner-profile";
import { fetchCredentials } from "@/lib/db/credentials";
import {
  evidenceLabelForStage,
  nextStepForStage,
  pipelineStageLabel,
  resolveEffectivePipelineStage,
} from "@/lib/competency-pipeline";

export type ValidationSummary = {
  skillId: string;
  skill: string;
  pipelineStage: string;
  currentStageLabel: string;
  evidence: string;
  institution: string;
  nextStep: string;
  result: string;
  status: string;
  evaluatedOn: string;
  sources: string[];
  reviewCount: number;
  supportingRecords: number;
  latestActivity: string;
  task: string;
  rows: { name: string; type: string; date: string; role: string }[];
  evidencePackageSent: boolean;
  institutionFeedback?: string;
};

export async function buildValidationSummary(
  userId: string,
  skill: DeclaredSkill,
): Promise<ValidationSummary> {
  const [ghActs, lmsEv, ghRepos, reviews, attempt, attestationRequest, profile, credentials] = await Promise.all([
    supabase
      .from("github_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("lms_evidence")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .order("fetched_at", { ascending: false })
      .limit(20),
    supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .limit(10),
    fetchPeerReviews(userId),
    fetchAttempt(userId, skill.id),
    fetchAttestationRequestForSkill(userId, skill.id),
    fetchLearnerProfile(userId),
    fetchCredentials(userId),
  ]);

  const skillReviews = reviews.filter((r) => r.skill === skill.name);
  const rows: ValidationSummary["rows"] = [];
  const inWallet = credentials.some((c) => c.skill === skill.name);

  for (const e of lmsEv.data ?? []) {
    rows.push({
      name: e.course_name,
      type: "LMS",
      date: new Date(e.fetched_at).toLocaleDateString(),
      role: "Primary evidence",
    });
  }
  for (const a of ghActs.data ?? []) {
    rows.push({
      name: a.activity_title,
      type: "GitHub",
      date: a.occurred_at ? new Date(a.occurred_at).toLocaleDateString() : "—",
      role: "Code contribution",
    });
  }
  for (const r of ghRepos.data ?? []) {
    rows.push({
      name: r.repo_name,
      type: "GitHub",
      date: r.last_updated ? new Date(r.last_updated).toLocaleDateString() : "—",
      role: "Repository",
    });
  }
  if (attempt) {
    rows.push({
      name: `Practical attempt ${attempt.attemptId}`,
      type: "Practical Submission",
      date: new Date(attempt.startedAt).toLocaleDateString(),
      role: attempt.passed ? "Passed practical task" : "Hands-on artifact",
    });
  }
  for (const r of skillReviews) {
    rows.push({
      name: `${r.reviewerName} — ${r.reviewerRole}`,
      type: "Review",
      date: new Date(r.date).toLocaleDateString(),
      role: "Peer review",
    });
  }

  const sources = [...new Set(rows.map((r) => r.type))];
  const supportingRecords = rows.length;
  const hasEvidence = supportingRecords > 0 || skill.status === "Evidence Linked";

  if (attestationRequest?.status === "approved") {
    rows.push({
      name: "Institution attestation approved",
      type: "Attestation",
      date: attestationRequest.reviewedAt
        ? new Date(attestationRequest.reviewedAt).toLocaleDateString()
        : "—",
      role: "Institution approval",
    });
  }

  const dates = rows
    .map((r) => r.date)
    .filter((d) => d !== "—")
    .sort()
    .reverse();

  const institution = institutionDisplayName(
    attestationRequest?.institutionName
      ?? (profile.institution !== "—" ? profile.institution : "CUST"),
  );

  const pipelineStage = resolveEffectivePipelineStage(skill, {
    hasEvidence,
    attemptPassed: attempt?.passed === true || attempt?.status === "passed",
    attemptInProgress: !!attempt && ["in_progress", "submitted", "auto_submitted"].includes(attempt.status),
    attestationStatus: attestationRequest?.status,
    inWallet,
    peerReviewCount: skillReviews.length,
  });

  const currentStageLabel = pipelineStageLabel(pipelineStage);
  const evidencePackageSent = !!attestationRequest && attestationRequest.status === "pending";

  return {
    skillId: skill.id,
    skill: skill.name,
    pipelineStage,
    currentStageLabel,
    evidence: evidenceLabelForStage(pipelineStage),
    institution,
    nextStep: nextStepForStage(pipelineStage, institution),
    result: pipelineStage === "institution_attestation_rejected" || pipelineStage === "institution_rejected"
      ? "Rejected"
      : hasEvidence || attempt?.passed ? "In progress" : "Pending",
    status: currentStageLabel,
    evaluatedOn: dates[0] ?? "—",
    sources: sources.length ? sources : ["No evidence yet"],
    reviewCount: skillReviews.length,
    supportingRecords,
    latestActivity: dates[0] ?? "—",
    task: attempt ? `Attempt ${attempt.attemptId}` : "No task submitted",
    rows,
    evidencePackageSent,
    institutionFeedback: attestationRequest?.institutionFeedback,
  };
}

export async function buildAllValidationSummaries(
  userId: string,
  skills: DeclaredSkill[],
): Promise<ValidationSummary[]> {
  return Promise.all(skills.map((skill) => buildValidationSummary(userId, skill)));
}

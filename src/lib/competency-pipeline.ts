export type PipelineStage =
  | "declared"
  | "evidence_linked"
  | "practical_task"
  | "peer_review"
  | "institution_attestation_pending"
  | "institution_attestation_rejected"
  | "institution_rejected"
  | "wallet_ready"
  | "in_wallet";

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "declared", label: "Declared" },
  { key: "evidence_linked", label: "Evidence Linked" },
  { key: "practical_task", label: "Practical Task" },
  { key: "peer_review", label: "Peer Review" },
  { key: "institution_attestation_pending", label: "Institution Attestation" },
  { key: "wallet_ready", label: "Wallet" },
];

export function pipelineStageLabel(stage: string): string {
  const map: Record<string, string> = {
    declared: "Declared",
    evidence_linked: "Evidence Linked",
    practical_task: "Practical Task",
    peer_review: "Peer Review",
    institution_attestation_pending: "Institution Attestation Pending",
    institution_attestation_rejected: "Institution Attestation Rejected",
    institution_rejected: "Institution Rejected",
    wallet_ready: "Wallet Ready",
    in_wallet: "In Wallet",
  };
  return map[stage] ?? stage;
}

export function nextStepForStage(stage: string, institution?: string): string {
  switch (stage) {
    case "declared":
      return "Link GitHub, Moodle, or certificate evidence";
    case "evidence_linked":
      return "Complete the practical task for this skill";
    case "practical_task":
      return "Submit your practical task attempt";
    case "peer_review":
      return "Collect peer reviews (optional)";
    case "institution_attestation_pending":
      return `Waiting for ${institution || "your institution"} approval`;
    case "institution_attestation_rejected":
    case "institution_rejected":
      return "Review institution feedback and re-attempt";
    case "wallet_ready":
      return "Mint or add credential to wallet";
    case "in_wallet":
      return "Credential is in your wallet";
    default:
      return "Continue the verification pipeline";
  }
}

export function evidenceLabelForStage(stage: string): string {
  switch (stage) {
    case "institution_attestation_pending":
      return "Practical Task Passed";
    case "wallet_ready":
    case "in_wallet":
      return "Practical Task Passed";
    case "evidence_linked":
      return "External evidence linked";
    case "practical_task":
      return "Practical task in progress";
    case "institution_attestation_rejected":
    case "institution_rejected":
      return "Institution rejected attestation";
    case "peer_review":
      return "Peer reviews collected";
    default:
      return "Declared competency";
  }
}

type AttemptContext = {
  status?: string;
  passed?: boolean;
} | null | undefined;

export function evidenceLabelForAttempt(stage: string, attempt: AttemptContext): string {
  if (stage !== "practical_task" || !attempt) {
    return evidenceLabelForStage(stage);
  }
  if (attempt.status === "passed" || attempt.passed) return "Practical task passed";
  if (attempt.status === "auto_submitted" || attempt.status === "expired_no_submission") {
    return "Practical task timed out";
  }
  if (attempt.status === "submitted") {
    return "Practical task submitted";
  }
  if (attempt.status === "in_progress") return "Practical task in progress";
  return evidenceLabelForStage(stage);
}

export function nextStepForAttempt(
  stage: string,
  attempt: AttemptContext,
  institution?: string,
): string {
  if (stage === "practical_task" && attempt) {
    if (attempt.status === "passed" || attempt.passed) {
      return nextStepForStage("institution_attestation_pending", institution);
    }
    if (attempt.status === "submitted") {
      return "Awaiting practical task evaluation";
    }
    if (attempt.status === "expired_no_submission") {
      return "Retry the practical task";
    }
    if (attempt.status === "in_progress") {
      return "Complete and submit your practical task";
    }
  }
  return nextStepForStage(stage, institution);
}

export function pipelineStageIndex(stage: string): number {
  const order: PipelineStage[] = [
    "declared",
    "evidence_linked",
    "practical_task",
    "peer_review",
    "institution_attestation_pending",
    "wallet_ready",
    "in_wallet",
  ];
  const idx = order.indexOf(stage as PipelineStage);
  if (idx >= 0) return idx;
  if (stage === "institution_attestation_rejected" || stage === "institution_rejected") {
    return order.indexOf("institution_attestation_pending");
  }
  return 0;
}

export function resolveEffectivePipelineStage(
  skill: { pipelineStage?: string },
  opts: {
    hasEvidence?: boolean;
    attemptPassed?: boolean;
    attemptInProgress?: boolean;
    attestationStatus?: string;
    inWallet?: boolean;
    peerReviewCount?: number;
  },
): PipelineStage {
  const stored = (skill.pipelineStage ?? "declared") as PipelineStage;

  if (opts.inWallet || stored === "in_wallet") return "in_wallet";
  if (stored === "wallet_ready") return "wallet_ready";
  if (stored === "institution_attestation_rejected" || stored === "institution_rejected") {
    return "institution_attestation_rejected";
  }
  if (stored === "institution_attestation_pending") return "institution_attestation_pending";

  if (opts.attestationStatus === "rejected" || opts.attestationStatus === "Attestation Rejected") {
    return "institution_attestation_rejected";
  }
  if (
    opts.attestationStatus === "pending"
    || opts.attestationStatus === "Pending Attestation"
    || opts.attestationStatus === "Needs Clarification"
  ) {
    return "institution_attestation_pending";
  }
  if (opts.attestationStatus === "approved" || opts.attestationStatus === "Attestation Approved") {
    return "wallet_ready";
  }

  if (opts.attemptPassed) return "institution_attestation_pending";
  if (opts.attemptInProgress) return "practical_task";
  if (opts.peerReviewCount && opts.peerReviewCount > 0) return "peer_review";
  if (opts.hasEvidence || stored === "evidence_linked") return "evidence_linked";

  return "declared";
}

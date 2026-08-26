export type PipelineStage =
  | "declared"
  | "evidence_linked"
  | "practical_task"
  | "peer_review"
  | "verification_pending"
  | "verification_failed"
  | "institution_attestation_pending"
  | "institution_attestation_rejected"
  | "institution_rejected"
  | "wallet_ready"
  | "in_wallet";

/** UI pipeline stages shown in Validation Trail stepper */
export const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "declared", label: "Declared" },
  { key: "evidence_linked", label: "Evidence" },
  { key: "practical_task", label: "Assessment" },
  { key: "verification", label: "Verification" },
  { key: "wallet_ready", label: "Wallet" },
];

export const VERIFICATION_STAGE_TOOLTIP =
  "Verified automatically once your evidence and assessment score meet SIJIL's threshold.";

export function pipelineStageLabel(stage: string): string {
  const map: Record<string, string> = {
    declared: "Declared",
    evidence_linked: "Evidence Linked",
    practical_task: "Assessment",
    peer_review: "Peer Review",
    verification_pending: "Verification Pending",
    verification_failed: "Verification Failed",
    institution_attestation_pending: "Verification Pending",
    institution_attestation_rejected: "Verification Failed",
    institution_rejected: "Verification Failed",
    wallet_ready: "Wallet Ready",
    in_wallet: "In Wallet",
  };
  return map[stage] ?? stage;
}

export function nextStepForStage(stage: string): string {
  switch (stage) {
    case "declared":
      return "Link GitHub, Moodle, or certificate evidence";
    case "evidence_linked":
      return "Complete the practical task for this competency";
    case "practical_task":
      return "Submit your practical task attempt";
    case "peer_review":
      return "Collect peer reviews (optional)";
    case "verification_pending":
    case "institution_attestation_pending":
      return "Awaiting automated verification — evidence and assessment score are being evaluated";
    case "verification_failed":
    case "institution_attestation_rejected":
    case "institution_rejected":
      return "Review verification requirements and re-attempt";
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
    case "verification_pending":
    case "institution_attestation_pending":
      return "Awaiting verification";
    case "wallet_ready":
    case "in_wallet":
      return "Practical Task Passed";
    case "evidence_linked":
      return "External evidence linked";
    case "practical_task":
      return "Practical task in progress";
    case "verification_failed":
    case "institution_attestation_rejected":
    case "institution_rejected":
      return "Verification requirements not met";
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
  if (attempt.status === "submitted" || attempt.status === "auto_submitted") {
    return "Practical task submitted";
  }
  if (attempt.status === "in_progress") return "Practical task in progress";
  return evidenceLabelForStage(stage);
}

export function nextStepForAttempt(stage: string, attempt: AttemptContext): string {
  if (stage === "practical_task" && attempt) {
    if (attempt.status === "passed" || attempt.passed) {
      return nextStepForStage("wallet_ready");
    }
    if (attempt.status === "submitted" || attempt.status === "auto_submitted") {
      return "Awaiting practical task evaluation";
    }
    if (attempt.status === "in_progress") {
      return "Complete and submit your practical task";
    }
  }
  return nextStepForStage(stage);
}

export function pipelineStageIndex(stage: string): number {
  const uiOrder = ["declared", "evidence_linked", "practical_task", "verification", "wallet_ready", "in_wallet"];
  const normalized =
    stage === "institution_attestation_pending" || stage === "verification_pending"
      ? "verification"
      : stage === "institution_attestation_rejected" ||
          stage === "institution_rejected" ||
          stage === "verification_failed"
        ? "practical_task"
        : stage === "peer_review"
          ? "verification"
          : stage === "wallet_ready" || stage === "in_wallet"
            ? "wallet_ready"
            : stage;
  const idx = uiOrder.indexOf(normalized);
  return idx >= 0 ? idx : 0;
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
  if (
    stored === "institution_attestation_rejected" ||
    stored === "institution_rejected" ||
    stored === "verification_failed"
  ) {
    return "practical_task";
  }
  if (stored === "institution_attestation_pending" || stored === "verification_pending") {
    return opts.attemptPassed ? "wallet_ready" : "peer_review";
  }

  if (opts.attestationStatus === "approved" || opts.attestationStatus === "Attestation Approved") {
    return "wallet_ready";
  }

  if (opts.attemptPassed) return "wallet_ready";
  if (opts.attemptInProgress) return "practical_task";
  if (opts.peerReviewCount && opts.peerReviewCount > 0) return "peer_review";
  if (opts.hasEvidence || stored === "evidence_linked") return "evidence_linked";

  return "declared";
}

/** Build PipelineStepper stages for UI from effective stage */
export function buildPipelineStepperStages(effectiveStage: string): {
  id: string;
  label: string;
  status: "complete" | "current" | "upcoming";
}[] {
  const currentIdx = pipelineStageIndex(effectiveStage);
  return PIPELINE_STAGES.map((s, i) => ({
    id: s.key,
    label: s.label,
    status: i < currentIdx ? "complete" : i === currentIdx ? "current" : "upcoming",
  }));
}

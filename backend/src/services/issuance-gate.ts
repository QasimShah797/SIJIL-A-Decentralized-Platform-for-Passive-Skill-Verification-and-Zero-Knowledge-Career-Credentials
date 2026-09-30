/**
 * Server-side issuance eligibility: ownership, attested pipeline, trust-tier evidence.
 */
import { PIPELINE_STAGE } from "../constants/status";

export const ATTESTED_PIPELINE_STAGES = new Set<string>([
  PIPELINE_STAGE.WALLET_READY,
  PIPELINE_STAGE.IN_WALLET,
]);

export interface IssuanceEvidence {
  source: string;
  title?: string;
  url?: string | null;
  contentHash?: string | null;
}

export interface IssuanceGateInput {
  skillOwnerId: string;
  requestUserId: string;
  pipelineStage: string;
  evidence: IssuanceEvidence[];
}

export type IssuanceGateResult =
  | { ok: true }
  | { ok: false; status: 403 | 409; message: string };

export function isLmsPreverifiedSource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return (
    normalized === "lms" ||
    normalized.includes("moodle") ||
    normalized === "teacher_feedback" ||
    normalized.includes("teacher")
  );
}

export function evidenceMeetsTrustTier(evidence: IssuanceEvidence[]): boolean {
  if (evidence.length === 0) return false;
  const qualifying = evidence.filter((row) => row.source.trim().length > 0);
  if (qualifying.length === 0) return false;
  const hasLms = qualifying.some((row) => isLmsPreverifiedSource(row.source));
  const hasCorroborating = qualifying.some((row) => !isLmsPreverifiedSource(row.source));
  return hasLms || hasCorroborating;
}

export function evaluateIssuanceEligibility(input: IssuanceGateInput): IssuanceGateResult {
  if (input.skillOwnerId !== input.requestUserId) {
    return {
      ok: false,
      status: 403,
      message: "Skill does not belong to the authenticated learner",
    };
  }

  if (!ATTESTED_PIPELINE_STAGES.has(input.pipelineStage)) {
    return {
      ok: false,
      status: 409,
      message: "Skill is not verified or attested and cannot be issued",
    };
  }

  if (!evidenceMeetsTrustTier(input.evidence)) {
    return {
      ok: false,
      status: 409,
      message: "Supporting evidence does not meet trust tier requirements",
    };
  }

  return { ok: true };
}

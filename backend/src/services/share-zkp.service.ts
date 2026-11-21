/**
 * Attach verified private-result Groth16 proofs to a wallet share.
 *
 * Trust model: SIJIL prepares witnesses from server-held trusted openings /
 * attested snapshots. Exact private values never enter disclosed_payload.
 * Recipients see SIJIL-verified privateResults (verifiedBy: "sijil").
 */
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ASSESSMENT_ZKP_TYPE,
  GITHUB_POLICY_THRESHOLD,
  GITHUB_ZKP_TYPE,
  MOODLE_ZKP_TYPE,
  PEER_REVIEW_ZKP_TYPE,
  SHARE_ASSESSMENT_POLICY_VERSION,
  SHARE_ASSESSMENT_THRESHOLD,
  SHARE_MOODLE_POLICY_VERSION,
  SHARE_MOODLE_THRESHOLD_PERCENT,
  SHARE_PEER_POLICY_VERSION,
  SHARE_PEER_REVIEW_THRESHOLD,
} from "./zkp-policy";
import { generateScoreThresholdProof } from "./score-zkp-proof.service";
import { resolveZkpArtifactDir, PINNED_VERIFICATION_KEY_SHA256 } from "./zkp-artifacts";
import {
  privateResultPlaceholder,
  type EvidenceModes,
  type PrivateResultView,
} from "./share-evidence-summary";
import type { WalletCompetencyRecordView } from "../types/wallet.types";
import { AppError } from "../utils/AppError";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import { readAssessmentCommitment, assertTrustedOpening, type AssessmentAttemptRecord, type AssessmentOpeningRecord } from "./assessment-binding";
import { supabaseService } from "./supabase.service";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { verifyCredentialHash } from "./signing.service";

const requireSnarkjs = createRequire(__filename);

export type AttachedPrivateProof = {
  claimType: PrivateResultView["claimType"];
  policyId: string;
  circuitId: string;
  threshold: string;
  commitment: string;
  publicSignals: string[];
  proof: unknown;
  credentialId: string | null;
  verified: true;
};

export type ShareZkpAttachment = {
  privateResults: PrivateResultView[];
  proofs: AttachedPrivateProof[];
};

function mapAttempt(row: Record<string, unknown> | null): AssessmentAttemptRecord | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    learnerUserId: typeof row.learner_user_id === "string" ? row.learner_user_id : "",
    skillId: typeof row.skill_id === "string" ? row.skill_id : null,
    status: typeof row.status === "string" ? row.status : "",
    passed: row.passed === true,
    percentage: typeof row.percentage === "number" || typeof row.percentage === "string" ? row.percentage : null,
    commitment: typeof row.commitment === "string" ? row.commitment : null,
    commitmentScheme: typeof row.commitment_scheme === "string" ? row.commitment_scheme : null,
    commitmentCircuitId: typeof row.commitment_circuit_id === "string" ? row.commitment_circuit_id : null,
    commitmentVersion: typeof row.commitment_version === "number" ? row.commitment_version : null,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function mapOpening(row: Record<string, unknown> | null): AssessmentOpeningRecord | null {
  if (!row) return null;
  const score = typeof row.score === "number" ? row.score : Number(row.score);
  return {
    score: Number.isFinite(score) ? score : NaN,
    blinding: typeof row.blinding === "string" ? row.blinding : "",
    learnerId: typeof row.learner_user_id === "string" ? row.learner_user_id : "",
    attemptId: typeof row.attempt_id === "string" ? row.attempt_id : "",
  };
}

async function provePracticalPrivate(
  userId: string,
  competencyName: string,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_ASSESSMENT_POLICY_VERSION;
  const circuitId = ASSESSMENT_ZKP_TYPE;
  try {
    const { data: credRow, error } = await supabaseService.client
      .from("credentials")
      .select("id, credential_uri, credential_hash, credential_document, proof, revoked_at, skill_name, user_id")
      .eq("user_id", userId)
      .eq("skill_name", competencyName)
      .maybeSingle();
    if (error || !credRow) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }
    const proofValue = credRow.proof && typeof credRow.proof === "object"
      ? String((credRow.proof as Record<string, unknown>).proofValue ?? "")
      : "";
    const recomputed = recomputeStoredDocumentHash(credRow.credential_document);
    if (!recomputed || recomputed !== credRow.credential_hash || !proofValue || !verifyCredentialHash(recomputed, proofValue)) {
      return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
    }
    const commitmentRead = readAssessmentCommitment(credRow.credential_document);
    if (commitmentRead.status !== "ok") {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }

    const { data: attemptRow, error: attemptErr } = await supabaseService.client
      .from("mcq_task_attempts")
      .select("id, learner_user_id, skill_id, status, passed, percentage, commitment, commitment_scheme, commitment_circuit_id, commitment_version, submitted_at, created_at")
      .eq("id", commitmentRead.claim.attemptId)
      .eq("learner_user_id", userId)
      .maybeSingle();
    if (attemptErr || !attemptRow) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }
    const attempt = mapAttempt(attemptRow as Record<string, unknown>);
    const { data: openingRow } = await supabaseService.client
      .from("assessment_openings")
      .select("attempt_id, learner_user_id, score, blinding")
      .eq("attempt_id", commitmentRead.claim.attemptId)
      .eq("learner_user_id", userId)
      .maybeSingle();
    const opening = mapOpening((openingRow as Record<string, unknown> | null) ?? null);
    if (!attempt || !opening) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }
    const checked = await assertTrustedOpening({
      learnerId: userId,
      attempt,
      assessmentCommitment: commitmentRead.claim,
      opening,
    });
    if (!checked.ok) {
      return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
    }

    const score = opening.score;
    if (!Number.isInteger(score) || score < SHARE_ASSESSMENT_THRESHOLD) {
      return { result: privateResultPlaceholder("practical_assessment", "unmet", policyId, circuitId) };
    }

    if (!resolveZkpArtifactDir("meets")) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }

    const { pathToFileURL } = await import("node:url");
    const { commitmentModulePath } = await import("./zkp-artifacts");
    const mod = await import(pathToFileURL(commitmentModulePath()).href) as {
      decimal: (value: bigint | number) => string;
      uuidToField: (value: string) => bigint;
    };

    const generated = await generateScoreThresholdProof({
      score,
      blinding: opening.blinding,
      learnerId: mod.decimal(mod.uuidToField(userId)),
      attemptId: mod.decimal(mod.uuidToField(opening.attemptId)),
      commitment: commitmentRead.claim.commitment,
      variant: "meets",
      threshold: SHARE_ASSESSMENT_THRESHOLD,
    });

    // Verify before attach
    const artifactDir = resolveZkpArtifactDir("meets");
    if (!artifactDir) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }
    const vkPath = path.join(artifactDir, "verification_key.json");
    const vkBytes = readFileSync(vkPath);
    const vkHash = createHash("sha256").update(vkBytes).digest("hex");
    if (vkHash !== PINNED_VERIFICATION_KEY_SHA256) {
      return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
    }
    const snarkjs = requireSnarkjs("snarkjs") as {
      groth16: { verify: (vk: object, signals: string[], proof: unknown) => Promise<boolean> };
    };
    const ok = await snarkjs.groth16.verify(JSON.parse(vkBytes.toString("utf8")), generated.publicSignals, generated.proof);
    if (!ok) {
      return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
    }

    return {
      result: privateResultPlaceholder("practical_assessment", "confirmed", policyId, circuitId),
      proof: {
        claimType: "practical_assessment",
        policyId,
        circuitId,
        threshold: String(SHARE_ASSESSMENT_THRESHOLD),
        commitment: commitmentRead.claim.commitment,
        publicSignals: generated.publicSignals,
        proof: generated.proof,
        credentialId: typeof credRow.credential_uri === "string" ? credRow.credential_uri : null,
        verified: true,
      },
    };
  } catch {
    return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
  }
}

function countEligiblePeerReviews(record: WalletCompetencyRecordView): number {
  const reviews = record.evidencePackage.peerReviews;
  if (!Array.isArray(reviews)) return 0;
  return reviews.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const status = String(row.reviewStatus ?? row.status ?? "").toLowerCase();
    if (status.includes("pending") || status.includes("revoked")) return false;
    return true;
  }).length;
}

function moodleCompletionCounts(record: WalletCompetencyRecordView): { completed: number; required: number } {
  const assignments = record.evidencePackage.lms.assignments ?? [];
  const list = Array.isArray(assignments) ? assignments : [];
  const required = list.length;
  let completed = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const status = String(row.status ?? row.completion_status ?? "").toLowerCase();
    if (status.includes("complete") || status.includes("submitted") || row.completed === true) {
      completed += 1;
    }
  }
  return { completed, required };
}

async function proveMoodlePrivate(
  record: WalletCompetencyRecordView,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_MOODLE_POLICY_VERSION;
  const circuitId = MOODLE_ZKP_TYPE;
  const { completed, required } = moodleCompletionCounts(record);
  if (required === 0) {
    return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
  }
  if (completed * 100 < required * SHARE_MOODLE_THRESHOLD_PERCENT) {
    return { result: privateResultPlaceholder("moodle_learning", "unmet", policyId, circuitId) };
  }
  // Artifacts require circom build — do not fake a proof.
  const artifactDir = path.resolve(__dirname, "../../zkp-artifacts/moodle-completion-v1");
  if (!existsSync(path.join(artifactDir, "verification_key.json"))) {
    return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
  }
  return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
}

async function provePeerPrivate(
  record: WalletCompetencyRecordView,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_PEER_POLICY_VERSION;
  const circuitId = PEER_REVIEW_ZKP_TYPE;
  const count = countEligiblePeerReviews(record);
  if (count < SHARE_PEER_REVIEW_THRESHOLD) {
    return { result: privateResultPlaceholder("peer_review", "unmet", policyId, circuitId) };
  }
  const artifactDir = path.resolve(__dirname, "../../zkp-artifacts/peer-review-count-v1");
  if (!existsSync(path.join(artifactDir, "verification_key.json"))) {
    return { result: privateResultPlaceholder("peer_review", "unavailable", policyId, circuitId) };
  }
  return { result: privateResultPlaceholder("peer_review", "unavailable", policyId, circuitId) };
}

async function proveGithubPrivate(
  userId: string,
  competencyId: string,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = "github-70-repo-v1";
  const circuitId = GITHUB_ZKP_TYPE;
  try {
    // Reuse stored verified GitHub proofs when present (no fake counts).
    const { data, error } = await supabaseService.client
      .from("github_zkp_proofs")
      .select("id, threshold, public_commitment, proof, public_signals, snapshot_id")
      .eq("learner_user_id", userId)
      .eq("threshold", GITHUB_POLICY_THRESHOLD)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error) || isMissingColumnError(error)) {
        return { result: privateResultPlaceholder("github_activity", "unavailable", policyId, circuitId) };
      }
      return { result: privateResultPlaceholder("github_activity", "failed", policyId, circuitId) };
    }
    if (!data || !data.proof) {
      return { result: privateResultPlaceholder("github_activity", "unavailable", policyId, circuitId) };
    }
    const publicSignals = Array.isArray(data.public_signals)
      ? data.public_signals.map(String)
      : [String(data.threshold), String(data.public_commitment)];
    return {
      result: privateResultPlaceholder("github_activity", "confirmed", policyId, circuitId),
      proof: {
        claimType: "github_activity",
        policyId,
        circuitId,
        threshold: String(data.threshold ?? GITHUB_POLICY_THRESHOLD),
        commitment: String(data.public_commitment ?? ""),
        publicSignals,
        proof: data.proof,
        credentialId: competencyId,
        verified: true,
      },
    };
  } catch {
    return { result: privateResultPlaceholder("github_activity", "failed", policyId, circuitId) };
  }
}

export async function buildShareZkpAttachment(input: {
  userId: string;
  record: WalletCompetencyRecordView;
  modes: EvidenceModes;
}): Promise<ShareZkpAttachment> {
  const privateResults: PrivateResultView[] = [];
  const proofs: AttachedPrivateProof[] = [];

  if (input.modes.practical_task_result === "private") {
    const out = await provePracticalPrivate(input.userId, input.record.competencyName);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.github_evidence === "private") {
    const out = await proveGithubPrivate(input.userId, input.record.competencyId);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.lms_evidence === "private") {
    const out = await proveMoodlePrivate(input.record);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.peer_reviews === "private") {
    const out = await provePeerPrivate(input.record);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }

  return { privateResults, proofs };
}

export function assertNoPrivateWitnessLeak(payload: Record<string, unknown>): void {
  const banned = ["blinding", "opening", "witness", "scorePercent", "exactScore", "commitCount"];
  const json = JSON.stringify(payload);
  for (const key of banned) {
    if (json.includes(`"${key}"`)) {
      throw new AppError("Share payload refused: private witness field leaked", 500);
    }
  }
}

// silence unused import in some builds
void loadCredentialByIdOrUri;

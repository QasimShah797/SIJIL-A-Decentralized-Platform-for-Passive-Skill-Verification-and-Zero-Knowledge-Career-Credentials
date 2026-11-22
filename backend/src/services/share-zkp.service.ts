/**
 * Attach verified private-result Groth16 proofs to a wallet share.
 *
 * Trust model: SIJIL prepares witnesses from server-held trusted openings /
 * attested snapshots. Exact private values never enter disclosed_payload.
 * Recipients see SIJIL-verified privateResults (verifiedBy: "sijil").
 */
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ASSESSMENT_ZKP_TYPE,
  SHARE_GITHUB_POLICY_VERSION,
  SHARE_GITHUB_THRESHOLD,
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
import { generateShareScoreThresholdProof } from "./score-zkp-proof.service";
import { commitmentModulePath, resolveZkpArtifactDir, PINNED_VERIFICATION_KEY_SHA256 } from "./zkp-artifacts";
import {
  privateResultPlaceholder,
  type EvidenceModes,
  type PrivateResultView,
} from "./share-evidence-summary";
import type { WalletCompetencyRecordView } from "../types/wallet.types";
import { AppError } from "../utils/AppError";
import type { CredentialRow } from "../types/credentials.types";
import { createSupabaseGitHubZkpStore } from "./github-zkp-store";
import { validationReferenceFromDocument } from "./versioned-issuance";
import { createSupabaseZkpPolicyStore } from "./zkp-policy-store";
import { readAssessmentCommitment, assertTrustedOpening, type AssessmentAttemptRecord, type AssessmentOpeningRecord } from "./assessment-binding";
import { supabaseService } from "./supabase.service";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";
import { recomputeStoredDocumentHash } from "./credential-verify";
import { verifyCredentialHash } from "./signing.service";
import { generateMoodleCompletionProof } from "./moodle-zkp-proof.service";
import { moodleCommitmentModulePath, resolveMoodleZkpArtifactDir, MOODLE_ARTIFACT_FILES } from "./moodle-zkp-artifacts";
import { generatePeerReviewCountProof } from "./peer-zkp-proof.service";
import { peerCommitmentModulePath, resolvePeerZkpArtifactDir, PEER_ARTIFACT_FILES } from "./peer-zkp-artifacts";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { pathToFileURL } from "node:url";

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
  snapshotId?: string;
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

function hasTrustedCredentialSignature(credential: CredentialRow): boolean {
  const hash = recomputeStoredDocumentHash(credential.credential_document);
  const proofValue = credential.proof?.proofValue;
  return Boolean(hash && hash === credential.credential_hash
    && typeof proofValue === "string" && verifyCredentialHash(hash, proofValue));
}

async function provePracticalPrivate(
  userId: string,
  competencyId: string,
  credRow: CredentialRow | null,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_ASSESSMENT_POLICY_VERSION;
  const circuitId = ASSESSMENT_ZKP_TYPE;
  try {
    if (!credRow || credRow.user_id !== userId || credRow.revoked_at) {
      return { result: privateResultPlaceholder("practical_assessment", "unavailable", policyId, circuitId) };
    }
    if (!hasTrustedCredentialSignature(credRow)) {
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
    if (!attempt || attempt.skillId !== competencyId || !opening) {
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

    const importCommitment = new Function("url", "return import(url)") as (url: string) => Promise<{
      decimal: (value: bigint | number) => string;
      uuidToField: (value: string) => bigint;
    }>;
    const mod = await importCommitment(pathToFileURL(commitmentModulePath()).href);

    const generated = await generateShareScoreThresholdProof({
      score,
      blinding: opening.blinding,
      learnerId: mod.decimal(mod.uuidToField(userId)),
      attemptId: mod.decimal(mod.uuidToField(opening.attemptId)),
      commitment: commitmentRead.claim.commitment,
      variant: "meets",
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
        credentialId: credRow.id,
        verified: true,
      },
    };
  } catch (err) {
    console.error("[share-zkp] practical private prove failed", {
      competencyId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { result: privateResultPlaceholder("practical_assessment", "failed", policyId, circuitId) };
  }
}

/** Collect peer-review rows used for share-peer-1-v1 (wallet peers + SIJIL form reviews stored under github.reviews). */
export function collectPeerReviewCandidates(record: WalletCompetencyRecordView): Record<string, unknown>[] {
  const peers = Array.isArray(record.evidencePackage.peerReviews)
    ? record.evidencePackage.peerReviews
    : [];
  const githubReviews = Array.isArray(record.evidencePackage.github?.reviews)
    ? record.evidencePackage.github.reviews
    : [];
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const push = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const key = String(row.id ?? row.external_reference ?? `${row.reviewer_name}:${row.reviewed_at ?? row.created_at ?? ""}`);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(row);
  };
  for (const item of peers) push(item);
  for (const item of githubReviews) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const origin = String(row.origin ?? "").toLowerCase();
    const role = String(row.reviewer_role ?? "").toLowerCase();
    const hasHumanFeedback = Boolean(
      row.review_text || row.comment || row.recommendation || row.decision,
    );
    // GitHub-channel SIJIL form / collaborator reviews still count as peer evidence.
    if (origin.includes("form review") || origin.includes("sijil") || role.includes("collaborator") || hasHumanFeedback) {
      push(row);
    }
  }
  return out;
}

export function isEligiblePeerReview(row: Record<string, unknown>, learnerUserId?: string): boolean {
  const status = String(row.reviewStatus ?? row.status ?? "").toLowerCase().trim();
  const decision = String(row.decision ?? row.recommendation ?? "").toLowerCase().trim();
  if (status.includes("pending") || status.includes("revoked") || status.includes("rejected") || status.includes("deleted")) {
    return false;
  }
  if (decision.includes("reject") || decision.includes("deny")) {
    return false;
  }
  // Self-review exclusion when both ids are present.
  const reviewerId = typeof row.reviewer_user_id === "string" ? row.reviewer_user_id : "";
  const revieweeId = typeof row.learner_user_id === "string"
    ? row.learner_user_id
    : (typeof row.user_id === "string" ? row.user_id : "");
  if (reviewerId && revieweeId && reviewerId === revieweeId) return false;
  if (learnerUserId && reviewerId && reviewerId === learnerUserId) return false;

  // Explicit completed / reviewed / submitted statuses.
  if (
    status.includes("reviewed")
    || status.includes("completed")
    || status.includes("submitted")
    || status.includes("approved")
    || status.includes("accepted")
  ) {
    return true;
  }
  // Rows without a pending status that carry review content are eligible.
  if (!status && (row.review_text || row.comment || row.recommendation || row.decision || row.reviewed_at)) {
    return true;
  }
  if (status && !status.includes("pending")) return true;
  return false;
}

export function countEligiblePeerReviews(record: WalletCompetencyRecordView, learnerUserId?: string): number {
  return collectPeerReviewCandidates(record).filter((row) => isEligiblePeerReview(row, learnerUserId)).length;
}

/** Moodle assignment completion for share-moodle-50-v1 (uses submission_status from moodle_assignments). */
export function isMoodleAssignmentCompleted(row: Record<string, unknown>): boolean {
  if (row.completed === true) return true;
  // SIJIL evidence_records may mark verified LMS rows without Moodle submission_status.
  if (String(row.evidence_record_status ?? "").toLowerCase() === "verified") return true;
  const status = String(
    row.submission_status ?? row.status ?? row.completion_status ?? "",
  ).toLowerCase().trim();
  if (!status) {
    // Graded timestamp or numeric grade alone indicates a completed eligible activity.
    if (row.graded_at) return true;
    const grade = typeof row.grade === "number" ? row.grade : Number(row.grade);
    return Number.isFinite(grade) && grade > 0;
  }
  if (
    status.includes("incomplete")
    || status.includes("pending")
    || status.includes("not submitted")
    || status.includes("notsubmitted")
    || status.includes("draft")
    || status === "new"
  ) {
    return false;
  }
  // Moodle stores "Graded" / "submitted" / "complete"; "notgraded" alone is incomplete unless submitted.
  if (status === "notgraded" || status === "not graded") {
    return Boolean(row.submitted_at || row.graded_at);
  }
  if (
    status.includes("graded")
    || status.includes("submitted")
    || status.includes("complete")
    || status.includes("passed")
    || status === "verified"
  ) {
    return true;
  }
  return Boolean(row.graded_at);
}

export function moodleCompletionCounts(record: WalletCompetencyRecordView): { completed: number; required: number } {
  const assignments = record.evidencePackage.lms.assignments ?? [];
  const list = Array.isArray(assignments) ? assignments : [];
  const required = list.length;
  let completed = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    if (isMoodleAssignmentCompleted(item as Record<string, unknown>)) {
      completed += 1;
    }
  }
  return { completed, required };
}

async function proveMoodlePrivate(
  userId: string,
  record: WalletCompetencyRecordView,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_MOODLE_POLICY_VERSION;
  const circuitId = MOODLE_ZKP_TYPE;
  try {
    const { completed, required } = moodleCompletionCounts(record);
    if (required === 0) {
      return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
    }
    if (completed * 100 < required * SHARE_MOODLE_THRESHOLD_PERCENT) {
      return { result: privateResultPlaceholder("moodle_learning", "unmet", policyId, circuitId) };
    }

    const artifactDir = resolveMoodleZkpArtifactDir();
    if (!artifactDir) {
      return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
    }

    const evidenceId = record.competencyId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { result: privateResultPlaceholder("moodle_learning", "unavailable", policyId, circuitId) };
    }

    const commitmentMod = await import(pathToFileURL(moodleCommitmentModulePath()).href) as {
      createMoodleCommitment: (input: {
        completed: number;
        required: number;
        learnerId: string;
        evidenceId: string;
      }) => Promise<{
        publicCommitment: { commitment: string };
        opening: { blinding: string };
      }>;
    };
    const created = await commitmentMod.createMoodleCommitment({
      completed,
      required,
      learnerId: userId,
      evidenceId,
    });
    const generated = await generateMoodleCompletionProof({
      completed,
      required,
      blinding: created.opening.blinding,
      learnerId: userId,
      evidenceId,
      commitment: created.publicCommitment.commitment,
      thresholdPercent: SHARE_MOODLE_THRESHOLD_PERCENT,
    });

    const vkBytes = readFileSync(path.join(artifactDir, MOODLE_ARTIFACT_FILES.verificationKey));
    const snarkjs = requireSnarkjs("snarkjs") as {
      groth16: { verify: (vk: object, signals: string[], proof: unknown) => Promise<boolean> };
    };
    const ok = await snarkjs.groth16.verify(
      JSON.parse(vkBytes.toString("utf8")),
      generated.publicSignals,
      generated.proof,
    );
    if (!ok) {
      return { result: privateResultPlaceholder("moodle_learning", "failed", policyId, circuitId) };
    }

    return {
      result: privateResultPlaceholder("moodle_learning", "confirmed", policyId, circuitId),
      proof: {
        claimType: "moodle_learning",
        policyId,
        circuitId,
        threshold: String(SHARE_MOODLE_THRESHOLD_PERCENT),
        commitment: created.publicCommitment.commitment,
        publicSignals: generated.publicSignals,
        proof: generated.proof,
        credentialId: evidenceId,
        verified: true,
      },
    };
  } catch {
    return { result: privateResultPlaceholder("moodle_learning", "failed", policyId, circuitId) };
  }
}

async function provePeerPrivate(
  userId: string,
  record: WalletCompetencyRecordView,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_PEER_POLICY_VERSION;
  const circuitId = PEER_REVIEW_ZKP_TYPE;
  try {
    // Policy share-peer-1-v1 requires at least 1 eligible review; never satisfy via threshold 0.
    const threshold = Math.max(1, SHARE_PEER_REVIEW_THRESHOLD);
    const candidates = collectPeerReviewCandidates(record);
    if (candidates.length === 0) {
      return { result: privateResultPlaceholder("peer_review", "unavailable", policyId, circuitId) };
    }
    const count = countEligiblePeerReviews(record, userId);
    if (count < threshold) {
      return { result: privateResultPlaceholder("peer_review", "unmet", policyId, circuitId) };
    }

    const artifactDir = resolvePeerZkpArtifactDir();
    if (!artifactDir) {
      return { result: privateResultPlaceholder("peer_review", "unavailable", policyId, circuitId) };
    }

    const evidenceId = record.competencyId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { result: privateResultPlaceholder("peer_review", "unavailable", policyId, circuitId) };
    }

    const commitmentMod = await import(pathToFileURL(peerCommitmentModulePath()).href) as {
      createPeerReviewCommitment: (input: {
        count: number;
        learnerId: string;
        evidenceId: string;
      }) => Promise<{
        publicCommitment: { commitment: string };
        opening: { blinding: string };
      }>;
    };
    const created = await commitmentMod.createPeerReviewCommitment({
      count,
      learnerId: userId,
      evidenceId,
    });
    const generated = await generatePeerReviewCountProof({
      count,
      blinding: created.opening.blinding,
      learnerId: userId,
      evidenceId,
      commitment: created.publicCommitment.commitment,
      threshold,
    });

    const vkBytes = readFileSync(path.join(artifactDir, PEER_ARTIFACT_FILES.verificationKey));
    const snarkjs = requireSnarkjs("snarkjs") as {
      groth16: { verify: (vk: object, signals: string[], proof: unknown) => Promise<boolean> };
    };
    const ok = await snarkjs.groth16.verify(
      JSON.parse(vkBytes.toString("utf8")),
      generated.publicSignals,
      generated.proof,
    );
    if (!ok) {
      return { result: privateResultPlaceholder("peer_review", "failed", policyId, circuitId) };
    }

    return {
      result: privateResultPlaceholder("peer_review", "confirmed", policyId, circuitId),
      proof: {
        claimType: "peer_review",
        policyId,
        circuitId,
        threshold: String(threshold),
        commitment: created.publicCommitment.commitment,
        publicSignals: generated.publicSignals,
        proof: generated.proof,
        credentialId: evidenceId,
        verified: true,
      },
    };
  } catch {
    return { result: privateResultPlaceholder("peer_review", "failed", policyId, circuitId) };
  }
}

export async function listCompetencyGithubRepoFullNames(
  userId: string,
  competencyId: string,
): Promise<string[]> {
  const { data: repos, error: reposErr } = await supabaseService.client
    .from("github_repos")
    .select("id, full_name, linked_skill_id")
    .eq("user_id", userId);
  if (reposErr) {
    if (isMissingRelationError(reposErr) || isMissingColumnError(reposErr)) return [];
    throw reposErr;
  }
  const { data: links } = await supabaseService.client
    .from("github_repo_skill_links")
    .select("github_repo_id, skill_id")
    .eq("user_id", userId)
    .eq("skill_id", competencyId);
  const linkedIds = new Set((links ?? []).map((row) => String(row.github_repo_id ?? "")));
  return (repos ?? [])
    .filter((row) => {
      const fullName = typeof row.full_name === "string" ? row.full_name : "";
      if (!fullName) return false;
      return row.linked_skill_id === competencyId || linkedIds.has(String(row.id ?? ""));
    })
    .map((row) => String(row.full_name));
}

async function proveGithubPrivate(
  userId: string,
  competencyId: string,
  credential: CredentialRow | null,
): Promise<{ result: PrivateResultView; proof?: AttachedPrivateProof }> {
  const policyId = SHARE_GITHUB_POLICY_VERSION;
  const circuitId = GITHUB_ZKP_TYPE;
  const result = (status: PrivateResultView["status"]) =>
    privateResultPlaceholder("github_activity", status, policyId, circuitId);
  try {
    if (!credential || credential.user_id !== userId || credential.revoked_at) {
      return { result: result("unavailable") };
    }
    if (!hasTrustedCredentialSignature(credential)) return { result: result("failed") };

    const linkedRepos = await listCompetencyGithubRepoFullNames(userId, competencyId);
    const linkedNames = new Set(linkedRepos.map((repo) => repo.toLowerCase()));
    if (linkedNames.size === 0) return { result: result("unavailable") };

    const validationReference = validationReferenceFromDocument(credential.credential_document);
    const policy = validationReference
      ? (await createSupabaseZkpPolicyStore().listForLearner(userId))
        .find((row) => row.id === validationReference && row.zkpType === GITHUB_ZKP_TYPE
          && row.outcome === "MEETS_THRESHOLD")
      : null;
    const versionSnapshotId = policy?.evidenceScope.snapshotId;
    if (validationReference && typeof versionSnapshotId !== "string") return { result: result("unavailable") };

    const credentialId = credential.id;
    const store = createSupabaseGitHubZkpStore();
    const { githubZkp } = await import("./github-zkp-workflow.service");
    let sawBelowThreshold = false;
    let sawVerificationFailure = false;
    async function proveSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof store.getSnapshot>>>): Promise<AttachedPrivateProof | null> {
      if (!linkedNames.has(snapshot.repositoryFullName.toLowerCase())) return null;
      try {
        const proofView = await githubZkp.requestProof(userId, snapshot.snapshotId, SHARE_GITHUB_THRESHOLD);
        const publicSignals = [...proofView.publicSignals];
        const checked = await verifyGitHubContributionProof({
          circuitId,
          proof: proofView.proof,
          publicSignals,
        }, snapshot.commitment, "meets");
        if (publicSignals[0] !== String(SHARE_GITHUB_THRESHOLD) || !checked.cryptographicallyValid) {
          sawVerificationFailure = true;
          return null;
        }
        return {
          claimType: "github_activity",
          policyId,
          circuitId,
          threshold: String(SHARE_GITHUB_THRESHOLD),
          commitment: snapshot.commitment,
          publicSignals,
          proof: proofView.proof,
          credentialId,
          snapshotId: snapshot.snapshotId,
          verified: true,
        };
      } catch (error) {
        if (error instanceof AppError && error.message === "The verified commit count does not meet that threshold") {
          sawBelowThreshold = true;
        } else {
          sawVerificationFailure = true;
        }
        return null;
      }
    }

    if (typeof versionSnapshotId === "string") {
      const snapshot = await store.getSnapshot(versionSnapshotId, userId);
      // The background policy row can be refreshed after issuance.
      if (snapshot && Date.parse(snapshot.verifiedAt) <= Date.parse(credential.valid_from)
        && snapshot.repositoryFullName.toLowerCase() === String(policy?.evidenceScope.repositoryFullName ?? "").toLowerCase()) {
        const proof = await proveSnapshot(snapshot);
        if (proof) return { result: result("confirmed"), proof };
      }
    } else {
      const snapshots = await store.listSnapshots(userId);
      for (const snapshot of snapshots) {
        const proof = await proveSnapshot(snapshot);
        if (proof) return { result: result("confirmed"), proof };
      }
      for (const repo of linkedRepos) {
        const snapshot = await githubZkp.createSnapshot(userId, repo).catch(() => null);
        if (!snapshot) continue;
        const stored = await store.getSnapshot(snapshot.snapshotId, userId);
        const proof = stored && await proveSnapshot(stored);
        if (proof) return { result: result("confirmed"), proof };
      }
    }
    return { result: result(sawVerificationFailure ? "failed" : sawBelowThreshold ? "unmet" : "unavailable") };
  } catch {
    return { result: result("failed") };
  }
}

export async function buildShareZkpAttachment(input: {
  userId: string;
  record: WalletCompetencyRecordView;
  modes: EvidenceModes;
  credential?: CredentialRow | null;
}): Promise<ShareZkpAttachment> {
  const privateResults: PrivateResultView[] = [];
  const proofs: AttachedPrivateProof[] = [];

  if (input.modes.practical_task_result === "private") {
    const out = await provePracticalPrivate(input.userId, input.record.competencyId, input.credential ?? null);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.github_evidence === "private") {
    const out = await proveGithubPrivate(input.userId, input.record.competencyId, input.credential ?? null);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.lms_evidence === "private") {
    const out = await proveMoodlePrivate(input.userId, input.record);
    privateResults.push(out.result);
    if (out.proof) proofs.push(out.proof);
  }
  if (input.modes.peer_reviews === "private") {
    const out = await provePeerPrivate(input.userId, input.record);
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

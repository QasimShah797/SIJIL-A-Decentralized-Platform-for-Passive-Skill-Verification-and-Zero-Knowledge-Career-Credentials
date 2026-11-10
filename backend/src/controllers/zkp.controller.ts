/**
 * Owner witness for in-browser Groth16 proving (legacy) and automated policy APIs.
 * Status responses never include private score/count/blinding.
 */
import { createHash } from "node:crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { AppError } from "../utils/AppError";
import { presentationTokenParamSchema } from "../validators/wallet.validator";
import { getOwnerWitness } from "../services/zkp-witness";
import { verifySharedScoreProof } from "../services/zkp-verify";
import { assessmentEvidenceRef } from "../services/assessment-zkp-automation.service";
import {
  createSupabaseZkpPolicyStore,
  toPublicPolicyStatus,
} from "../services/zkp-policy-store";
import { walletService } from "../services/wallet.service";
import { findCredentialForLearnerCompetency } from "../services/credential-verify.service";
import { readAssessmentCommitment } from "../services/assessment-binding";
import { filterRowsToScope, resolveCompetencyScope } from "../services/zkp-competency-scope.service";
import { recruiterPolicyResponse } from "./github-zkp.controller";
import {
  ASSESSMENT_POLICY_THRESHOLD,
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  GITHUB_POLICY_THRESHOLD,
  GITHUB_ZKP_TYPE,
} from "../services/zkp-policy";

export async function getZkpWitness(req: Request, res: Response): Promise<Response> {
  const witness = await getOwnerWitness({
    callerUserId: req.user!.id,
    callerRoles: req.userRoles ?? [],
    credentialId: paramString(req.params.credentialId, "credentialId"),
  });
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  return sendSuccess(res, witness);
}

const statusQuerySchema = z.object({
  competencyId: z.string().uuid().optional(),
}).strict();

const recruiterProofSchema = z.object({
  shareToken: z.string().min(16).max(512),
}).passthrough();

const assessmentPolicyVerifySchema = z.object({
  disclosureToken: z.string().min(32).max(128).optional(),
  shareToken: z.string().min(16).max(512).optional(),
}).strict();

async function respondWithProofVerification(token: string, body: unknown, res: Response): Promise<Response> {
  const decision = await verifySharedScoreProof(token, body);
  if (decision.httpStatus !== 200) {
    throw new AppError(decision.message, decision.httpStatus);
  }

  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  // Legacy browser proofs carry a learner-chosen threshold; only the policy endpoint reports policy outcomes.
  const policyCompliant = decision.result?.threshold === String(ASSESSMENT_POLICY_THRESHOLD);
  return sendSuccess(res, {
    ...decision.result,
    policyThreshold: ASSESSMENT_POLICY_THRESHOLD,
    policyCompliant,
  });
}

export async function verifySharedScoreProofRequest(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  return respondWithProofVerification(token, req.body ?? {}, res);
}

export async function verifyRecruiterScoreProof(req: Request, res: Response): Promise<Response> {
  const { shareToken } = recruiterProofSchema.parse(req.body ?? {});
  return respondWithProofVerification(shareToken, req.body ?? {}, res);
}

/** Learners cannot trigger assessment proofs; the backend worker evaluates issued credentials. */
export async function evaluateAssessmentZkp(_req: Request, _res: Response): Promise<Response> {
  throw new AppError("Manual assessment proofs are retired. SIJIL evaluates issued credentials automatically.", 410);
}

/** Learner status for assessment + GitHub policy outcomes (no private values). */
export async function getZkpStatus(req: Request, res: Response): Promise<Response> {
  const store = createSupabaseZkpPolicyStore();
  const availability = await store.checkAvailability();
  if (!availability.available) {
    return sendSuccess(res, {
      available: false,
      reason: availability.reason,
      assessment: [],
      github: [],
      policy: {
        assessmentThreshold: ASSESSMENT_POLICY_THRESHOLD,
        githubThreshold: GITHUB_POLICY_THRESHOLD,
      },
    });
  }

  const { competencyId } = statusQuerySchema.parse(req.query ?? {});
  const learnerId = req.user!.id;
  let rows = await store.listForLearner(learnerId);
  if (competencyId) {
    rows = filterRowsToScope(rows, learnerId, await resolveCompetencyScope(learnerId, competencyId));
  }
  const assessment = rows
    .filter((row) => row.zkpType === ASSESSMENT_ZKP_TYPE)
    .map(toPublicPolicyStatus);
  const github = rows
    .filter((row) => row.zkpType === GITHUB_ZKP_TYPE)
    .map(toPublicPolicyStatus);

  return sendSuccess(res, {
    available: true,
    competencyId: competencyId ?? null,
    assessment,
    github,
    policy: {
      assessmentThreshold: ASSESSMENT_POLICY_THRESHOLD,
      githubThreshold: GITHUB_POLICY_THRESHOLD,
    },
  });
}

/** Policy outcome for whoever holds the learner's selective-share link. */
export async function getSharedAssessmentPolicy(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  res.setHeader("Cache-Control", "no-store");
  req.body = { shareToken: token };
  return verifyAssessmentPolicy(req, res);
}

/** Recruiter assessment policy outcome without score/blinding. */
export async function verifyAssessmentPolicy(req: Request, res: Response): Promise<Response> {
  const body = assessmentPolicyVerifySchema.parse(req.body ?? {});
  const store = createSupabaseZkpPolicyStore();
  const availability = await store.checkAvailability();
  if (!availability.available) {
    return sendSuccess(res, {
      outcome: "NOT_VERIFIED",
      threshold: ASSESSMENT_POLICY_THRESHOLD,
      zkpType: ASSESSMENT_ZKP_TYPE,
      message: availability.reason === "missing_table"
        ? "ZKP policy table is not applied"
        : "Policy verification unavailable",
      scope: null,
      evidenceFreshAt: null,
      circuitVariant: null,
    });
  }

  const notFound = (message: string) => sendSuccess(res, {
    outcome: "NOT_VERIFIED",
    threshold: ASSESSMENT_POLICY_THRESHOLD,
    zkpType: ASSESSMENT_ZKP_TYPE,
    message,
    scope: null,
    evidenceFreshAt: null,
    circuitVariant: null,
  });

  let row = null;
  if (body.shareToken) {
    // Authorization comes from the learner's existing selective-share link.
    const share = await walletService.resolveShareForZkp(body.shareToken);
    const credential = await findCredentialForLearnerCompetency(share.learnerId, share.competencyId);
    const commitment = credential ? readAssessmentCommitment(credential.credential_document) : null;
    if (!credential || !commitment || commitment.status !== "ok") {
      return notFound("No signed assessment credential is shared by this link");
    }
    row = await store.getByEvidence(
      share.learnerId,
      ASSESSMENT_ZKP_TYPE,
      ASSESSMENT_POLICY_VERSION,
      assessmentEvidenceRef(commitment.claim.attemptId),
    );
    if (!row) return notFound("Assessment policy evaluation has not run for this credential yet");
    // The share link authorizes this view; disclosure-token expiry does not apply.
    return sendSuccess(res, await recruiterPolicyResponse({ ...row, disclosureExpiresAt: null }, ASSESSMENT_ZKP_TYPE));
  }

  if (!body.disclosureToken) {
    return notFound("A share link or disclosure code is required");
  }
  const tokenHash = createHash("sha256").update(body.disclosureToken).digest("hex");
  row = await store.getByDisclosureTokenHash(tokenHash);
  if (!row || row.zkpType !== ASSESSMENT_ZKP_TYPE) {
    return notFound("No assessment policy verification found");
  }
  return sendSuccess(res, await recruiterPolicyResponse(row, ASSESSMENT_ZKP_TYPE));
}

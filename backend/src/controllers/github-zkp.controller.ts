/**
 * Authenticated GitHub contribution proof API.
 * Private openings stay in the workflow / automation services.
 * Client-supplied thresholds are rejected; evaluation is backend-automated.
 */
import { createHash } from "node:crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { AppError } from "../utils/AppError";
import { githubZkp } from "../services/github-zkp-workflow.service";
import {
  createSupabaseZkpPolicyStore,
  type ZkpPolicyVerificationRow,
} from "../services/zkp-policy-store";
import { verifyPolicyRowForRecruiter } from "../services/zkp-policy-verify.service";
import {
  GITHUB_POLICY_THRESHOLD,
  GITHUB_ZKP_TYPE,
} from "../services/zkp-policy";

const verifySchema = z.object({
  disclosureToken: z.string().min(32).max(128),
}).strict();

const policyVerifySchema = z.object({
  disclosureToken: z.string().min(32).max(128).optional(),
  evidenceRef: z.string().min(1).max(256).optional(),
  learnerUserId: z.string().uuid().optional(),
}).strict();

export async function listZkpTypes(_req: Request, res: Response): Promise<Response> {
  return sendSuccess(res, await githubZkp.listTypes());
}

export async function listGitHubEvidence(req: Request, res: Response): Promise<Response> {
  return sendSuccess(res, await githubZkp.listEvidence(req.user!.id));
}

const AUTOMATED_ONLY = "Manual GitHub proof steps are retired. SIJIL evaluates linked repositories automatically.";

export async function createGitHubSnapshot(_req: Request, _res: Response): Promise<Response> {
  throw new AppError(AUTOMATED_ONLY, 410);
}

/**
 * Deprecated manual proof path. Client thresholds are not accepted.
 * Direct callers to POST /zkp/github/evaluate.
 */
export async function requestGitHubProof(req: Request, _res: Response): Promise<Response> {
  const body = req.body ?? {};
  if (body && typeof body === "object" && "threshold" in (body as object)) {
    throw new AppError(
      "Client-supplied thresholds are not accepted. SIJIL applies the fixed policy automatically.",
      400,
    );
  }
  throw new AppError(AUTOMATED_ONLY, 410);
}

/** Learners cannot trigger, refresh, or scope GitHub proofs; the backend worker does this. */
export async function evaluateGitHubZkp(_req: Request, _res: Response): Promise<Response> {
  throw new AppError(AUTOMATED_ONLY, 410);
}

export async function getGitHubProof(req: Request, res: Response): Promise<Response> {
  const proof = await githubZkp.getProof(req.user!.id, paramString(req.params.proofId, "proofId"));
  return sendSuccess(res, proof);
}

export async function createGitHubDisclosure(_req: Request, _res: Response): Promise<Response> {
  throw new AppError(AUTOMATED_ONLY, 410);
}

/**
 * Legacy manual disclosures (learner-chosen threshold). Still cryptographically
 * checked, but never reported as a SIJIL policy outcome.
 */
export async function verifyGitHubDisclosure(req: Request, res: Response): Promise<Response> {
  const body = verifySchema.parse(req.body ?? {});
  const result = await githubZkp.verifyDisclosure(body.disclosureToken);
  return sendSuccess(res, {
    ...result,
    policyOutcome: "NOT_VERIFIED",
    policyThreshold: GITHUB_POLICY_THRESHOLD,
    policyCompliant: false,
    policyMessage: "Legacy disclosure with a learner-chosen threshold. It is not a SIJIL policy outcome.",
  });
}

/** Recruiter policy verification without score/count/blinding. */
export async function verifyGitHubPolicy(req: Request, res: Response): Promise<Response> {
  const body = policyVerifySchema.parse(req.body ?? {});
  const store = createSupabaseZkpPolicyStore();
  const availability = await store.checkAvailability();
  if (!availability.available) {
    return sendSuccess(res, {
      outcome: "NOT_VERIFIED",
      threshold: GITHUB_POLICY_THRESHOLD,
      zkpType: GITHUB_ZKP_TYPE,
      message: availability.reason === "missing_table"
        ? "ZKP policy table is not applied"
        : "Policy verification unavailable",
      scope: null,
      evidenceFreshAt: null,
      circuitVariant: null,
    });
  }

  let row = null;
  if (body.disclosureToken) {
    const tokenHash = createHash("sha256").update(body.disclosureToken).digest("hex");
    row = await store.getByDisclosureTokenHash(tokenHash);
  }

  if (!row) {
    return sendSuccess(res, {
      outcome: "NOT_VERIFIED",
      threshold: GITHUB_POLICY_THRESHOLD,
      zkpType: GITHUB_ZKP_TYPE,
      message: "No policy verification found for this disclosure",
      scope: null,
      evidenceFreshAt: null,
      circuitVariant: null,
    });
  }

  return sendSuccess(res, await recruiterPolicyResponse(row, GITHUB_ZKP_TYPE));
}

/** Shared recruiter response: re-verifies the stored proof and never returns private values. */
export async function recruiterPolicyResponse(
  row: ZkpPolicyVerificationRow,
  zkpType: ZkpPolicyVerificationRow["zkpType"],
) {
  if (row.zkpType !== zkpType) {
    throw new AppError("Disclosure does not match this proof type", 400);
  }
  if (row.disclosureExpiresAt && Date.parse(row.disclosureExpiresAt) <= Date.now()) {
    return {
      outcome: "NOT_VERIFIED",
      threshold: row.threshold,
      zkpType: row.zkpType,
      policyVersion: row.policyVersion,
      message: "Disclosure has expired",
      scope: row.evidenceScope,
      evidenceFreshAt: row.evidenceFreshAt,
      circuitVariant: row.circuitVariant,
      check: "not_evaluated",
    };
  }
  const view = await verifyPolicyRowForRecruiter(row);
  return {
    outcome: view.outcome,
    threshold: view.threshold,
    zkpType: view.zkpType,
    policyVersion: view.policyVersion,
    circuitVariant: view.circuitVariant,
    commitment: view.commitment,
    scope: view.evidenceScope,
    evidenceFreshAt: view.evidenceFreshAt,
    evidenceRef: view.evidenceRef,
    errorCode: view.errorCode,
    check: view.check,
    message: view.message,
  };
}

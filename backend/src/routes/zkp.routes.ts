/**
 * Learner zero-knowledge witness and automated policy routes.
 * Recruiter and public routers do not mount this module.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { WITNESS_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";
import {
  evaluateAssessmentZkp,
  getZkpStatus,
  getZkpWitness,
} from "../controllers/zkp.controller";
import {
  createGitHubDisclosure,
  createGitHubSnapshot,
  evaluateGitHubZkp,
  getGitHubProof,
  listGitHubEvidence,
  listZkpTypes,
  requestGitHubProof,
} from "../controllers/github-zkp.controller";
import { GITHUB_PROOF_RATE_LIMIT, GITHUB_SNAPSHOT_RATE_LIMIT } from "../middleware/rateLimit.middleware";

const router = Router();

function learnerLimit(max: number) {
  return rateLimit({
    windowMs: 60_000,
    max,
    key: (req) => req.user?.id || req.ip || "unknown",
  });
}

export const githubSnapshotRateLimit = learnerLimit(GITHUB_SNAPSHOT_RATE_LIMIT.max);
export const githubProofRateLimit = learnerLimit(GITHUB_PROOF_RATE_LIMIT.max);

router.get(
  "/types",
  authMiddleware,
  requireLearner,
  asyncHandler(listZkpTypes),
);

router.get(
  "/status",
  authMiddleware,
  requireLearner,
  asyncHandler(getZkpStatus),
);

router.get(
  "/github/evidence",
  authMiddleware,
  requireLearner,
  asyncHandler(listGitHubEvidence),
);

router.post(
  "/github/snapshots",
  authMiddleware,
  requireLearner,
  githubSnapshotRateLimit,
  asyncHandler(createGitHubSnapshot),
);

router.post(
  "/github/evaluate",
  authMiddleware,
  requireLearner,
  githubProofRateLimit,
  asyncHandler(evaluateGitHubZkp),
);

router.post(
  "/github/proofs",
  authMiddleware,
  requireLearner,
  githubProofRateLimit,
  asyncHandler(requestGitHubProof),
);

router.get(
  "/github/proofs/:proofId",
  authMiddleware,
  requireLearner,
  asyncHandler(getGitHubProof),
);

router.post(
  "/github/disclosures",
  authMiddleware,
  requireLearner,
  githubProofRateLimit,
  asyncHandler(createGitHubDisclosure),
);

router.post(
  "/assessment/evaluate",
  authMiddleware,
  requireLearner,
  githubProofRateLimit,
  asyncHandler(evaluateAssessmentZkp),
);

router.get(
  "/witness/:credentialId",
  authMiddleware,
  requireLearner,
  rateLimit({
    ...WITNESS_RATE_LIMIT,
    key: (req) => req.user?.id || req.ip || "unknown",
  }),
  asyncHandler(getZkpWitness),
);

export default router;

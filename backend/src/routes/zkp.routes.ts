/**
 * Learner zero-knowledge witness routes.
 * Recruiter and public routers do not mount this module.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { WITNESS_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";
import { getZkpWitness } from "../controllers/zkp.controller";

const router = Router();

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

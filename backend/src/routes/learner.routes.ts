/**
 * Learner-scoped private routes (Phase 1: longitudinal journey).
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { getJourney } from "../controllers/learner-journey.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.get("/journey", asyncHandler(getJourney));

export default router;

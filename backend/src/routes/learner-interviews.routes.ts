/**
 * Learner-facing interview invitations. Scheduling stays on the recruiter router.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { listMyInterviews } from "../controllers/interview.controller";

const router = Router();

router.use(authMiddleware, requireLearner);
router.get("/interviews", asyncHandler(listMyInterviews));

export default router;

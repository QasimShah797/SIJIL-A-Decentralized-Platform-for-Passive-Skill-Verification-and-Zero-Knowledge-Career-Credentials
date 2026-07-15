/**
 * Peer review routes — evidence-based trust signals from verified project contributors.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  getPeerReviewProjects,
  getPeerReviewContributors,
  createPeerReviewInvite,
  resendPeerReviewInvitation,
  submitPeerReview,
  getPeerReviewStats,
  getPeerReviewInviteByToken,
  getPeerReviews,
} from "../controllers/peer-review.controller";

const router = Router();

router.get("/invite/:token", asyncHandler(getPeerReviewInviteByToken));
router.post("/submit", asyncHandler(submitPeerReview));

router.use(authMiddleware, requireLearner);

router.get("/projects", asyncHandler(getPeerReviewProjects));
router.get("/reviews", asyncHandler(getPeerReviews));
router.get("/project/:id/contributors", asyncHandler(getPeerReviewContributors));
router.post("/invite", asyncHandler(createPeerReviewInvite));
router.post("/invitations/:id/resend", asyncHandler(resendPeerReviewInvitation));
router.get("/stats", asyncHandler(getPeerReviewStats));

export default router;

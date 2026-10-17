/**
 * Peer review routes — evidence-based trust signals from verified project contributors.
 */
import { Request, Response, Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { runWithUserDb } from "../config/supabase";
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

function withLearnerDb(
  handler: (req: Request, res: Response) => Promise<Response>,
) {
  return (req: Request, res: Response) => runWithUserDb(req.accessToken, () => handler(req, res));
}

const router = Router();

router.get("/invite/:token", asyncHandler(getPeerReviewInviteByToken));
router.post("/submit", asyncHandler(submitPeerReview));

router.use(authMiddleware, requireLearner);

router.get("/projects", asyncHandler(withLearnerDb(getPeerReviewProjects)));
router.get("/reviews", asyncHandler(withLearnerDb(getPeerReviews)));
router.get("/project/:id/contributors", asyncHandler(withLearnerDb(getPeerReviewContributors)));
router.post("/invite", asyncHandler(withLearnerDb(createPeerReviewInvite)));
router.post("/invitations/:id/resend", asyncHandler(withLearnerDb(resendPeerReviewInvitation)));
router.get("/stats", asyncHandler(withLearnerDb(getPeerReviewStats)));

export default router;

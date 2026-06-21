/**
 * Context review routes — evidence reviews, requests, and public token form.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  importExternalReviews,
  getEvidenceReviews,
  getEligibleReviewers,
  createReviewRequest,
  getReviewRequestByToken,
  submitReviewByToken,
} from "../controllers/reviews.controller";

const router = Router();

router.get("/request/:token", asyncHandler(getReviewRequestByToken));
router.post("/submit/:token", asyncHandler(submitReviewByToken));

router.use(authMiddleware, requireLearner);

router.post("/import-external", asyncHandler(importExternalReviews));
router.get("/evidence/:evidenceId", asyncHandler(getEvidenceReviews));
router.get("/eligible-reviewers/:evidenceId", asyncHandler(getEligibleReviewers));
router.post("/request", asyncHandler(createReviewRequest));

export default router;

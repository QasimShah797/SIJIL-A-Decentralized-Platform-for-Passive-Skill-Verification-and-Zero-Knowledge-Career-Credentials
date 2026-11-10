import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getPublicPresentation,
  verifyPublicPresentation,
} from "../controllers/wallet.controller";
import { getSharedAssessmentPolicy, verifySharedScoreProofRequest } from "../controllers/zkp.controller";
import { ZKP_VERIFY_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";

const router = Router();

router.get("/:token", asyncHandler(getPublicPresentation));
router.post("/:token/verify", asyncHandler(verifyPublicPresentation));
router.post(
  "/:token/zkp/verify",
  rateLimit(ZKP_VERIFY_RATE_LIMIT),
  asyncHandler(verifySharedScoreProofRequest),
);
router.get(
  "/:token/zkp/policy",
  rateLimit(ZKP_VERIFY_RATE_LIMIT),
  asyncHandler(getSharedAssessmentPolicy),
);

export default router;

/**
 * Credential issuing, wallet, and selective disclosure routes.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin, requireLearner, requireReviewer } from "../middleware/role.middleware";
import {
  issueCredential,
  getCredential,
  getWallet,
  shareCredential,
  revokeShare,
  retryAnchor,
  revokeCredential,
} from "../controllers/credentials.controller";

const router = Router();

router.post("/issue", authMiddleware, requireLearner, asyncHandler(issueCredential));
router.get("/wallet/:learnerId", authMiddleware, asyncHandler(getWallet));
router.post("/:id/anchor/retry", authMiddleware, requireAdmin, asyncHandler(retryAnchor));
router.post("/:id/revoke", authMiddleware, requireReviewer, asyncHandler(revokeCredential));
router.get("/:id", authMiddleware, asyncHandler(getCredential));
router.post("/share", authMiddleware, requireLearner, asyncHandler(shareCredential));
router.post("/revoke-share", authMiddleware, requireLearner, asyncHandler(revokeShare));

export default router;

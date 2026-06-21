/**
 * Credential issuing, wallet, and selective disclosure routes.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  issueCredential,
  getCredential,
  getWallet,
  shareCredential,
  revokeShare,
} from "../controllers/credentials.controller";

const router = Router();

router.post("/issue", authMiddleware, requireLearner, asyncHandler(issueCredential));
router.get("/wallet/:learnerId", authMiddleware, asyncHandler(getWallet));
router.get("/:id", authMiddleware, asyncHandler(getCredential));
router.post("/share", authMiddleware, requireLearner, asyncHandler(shareCredential));
router.post("/revoke-share", authMiddleware, requireLearner, asyncHandler(revokeShare));

export default router;

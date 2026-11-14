/**
 * Credential issuing, wallet, and selective disclosure routes.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { rateLimit } from "../middleware/rateLimit.middleware";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin, requireLearner, requireReviewer } from "../middleware/role.middleware";
import {
  issueCredential,
  getCredential,
  exportCredentialDocument,
  getWallet,
  shareCredential,
  revokeShare,
  retryAnchor,
  previewLedgerReconcile,
  reconcileLedgerAnchor,
  revokeCredential,
} from "../controllers/credentials.controller";

const router = Router();

router.post("/issue", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(issueCredential));
router.get("/wallet/:learnerId", authMiddleware, asyncHandler(getWallet));
router.post("/:id/anchor/retry", authMiddleware, requireAdmin, asyncHandler(retryAnchor));
router.get("/:id/ledger-reconcile", authMiddleware, requireAdmin, asyncHandler(previewLedgerReconcile));
router.post("/:id/ledger-reconcile", authMiddleware, requireAdmin, asyncHandler(reconcileLedgerAnchor));
router.post("/:id/revoke", authMiddleware, requireReviewer, asyncHandler(revokeCredential));
router.get("/:id/document", authMiddleware, requireLearner, asyncHandler(exportCredentialDocument));
router.get("/:id", authMiddleware, asyncHandler(getCredential));
router.post("/share", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(shareCredential));
router.post("/revoke-share", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 20 }), asyncHandler(revokeShare));

export default router;

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
  getLedgerHistory,
} from "../controllers/credentials.controller";
import { issueValidatedCompetencyVersionForLearner } from "../controllers/competency-version.controller";

const router = Router();

router.post("/issue", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(issueCredential));
router.post("/versions/:versionId/issue", authMiddleware, requireReviewer, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(issueValidatedCompetencyVersionForLearner));
router.get("/wallet/:learnerId", authMiddleware, asyncHandler(getWallet));
router.post("/:id/anchor/retry", authMiddleware, requireAdmin, asyncHandler(retryAnchor));
router.get("/:id/ledger-reconcile", authMiddleware, requireAdmin, asyncHandler(previewLedgerReconcile));
router.post("/:id/ledger-reconcile", authMiddleware, requireAdmin, asyncHandler(reconcileLedgerAnchor));
router.get("/:id/ledger-history", authMiddleware, rateLimit({ windowMs: 60_000, max: 30 }), asyncHandler(getLedgerHistory));
router.post("/:id/revoke", authMiddleware, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(revokeCredential));
router.get("/:id/document", authMiddleware, requireLearner, asyncHandler(exportCredentialDocument));
router.get("/:id", authMiddleware, asyncHandler(getCredential));
router.post("/share", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(shareCredential));
router.post("/revoke-share", authMiddleware, requireLearner, rateLimit({ windowMs: 60_000, max: 20 }), asyncHandler(revokeShare));

export default router;

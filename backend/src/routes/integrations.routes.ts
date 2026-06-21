/**
 * GitHub integration routes — sync and evidence listing.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  syncGitHub,
  getGitHubEvidence,
  getSyncStatus,
  getLinkedProjectEvidence,
} from "../controllers/integrations.controller";
import { unlinkRepoEvidence } from "../controllers/evidence-records.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.post("/github/sync", asyncHandler(syncGitHub));
router.post("/github/unlink-repo", asyncHandler(unlinkRepoEvidence));
router.get("/github/linked-projects", asyncHandler(getLinkedProjectEvidence));
router.get("/github/evidence", asyncHandler(getGitHubEvidence));
router.get("/github/sync-status", asyncHandler(getSyncStatus));
router.post("/sync", asyncHandler(syncGitHub));
router.get("/evidence", asyncHandler(getGitHubEvidence));
router.get("/sync-status", asyncHandler(getSyncStatus));

export default router;

/**
 * Evidence submission routes — learner evidence on supporting_records.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  submitEvidence,
  getEvidenceBySkill,
  updateEvidenceStatus,
} from "../controllers/evidence.controller";
import {
  getUnmappedEvidence,
  ignoreEvidence,
} from "../controllers/evidence-records.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.post("/", asyncHandler(submitEvidence));
router.get("/unmapped", asyncHandler(getUnmappedEvidence));
router.patch("/:id/ignore", asyncHandler(ignoreEvidence));
router.get("/:skillId", asyncHandler(getEvidenceBySkill));
router.patch("/:id/status", asyncHandler(updateEvidenceStatus));

export default router;

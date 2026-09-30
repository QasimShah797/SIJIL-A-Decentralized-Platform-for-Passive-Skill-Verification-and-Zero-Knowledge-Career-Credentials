/**
 * Skill declaration routes — learner CRUD on declared_skills.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  listSkills,
  createSkill,
  declareSkill,
  getSkill,
  getRelatedEvidence,
  updateSkill,
  deleteSkill,
  syncAllSkillEvidence,
  syncSkillEvidence,
  applySkillEvent,
} from "../controllers/skills.controller";
import {
  linkEvidenceToSkill,
  unlinkEvidenceFromSkill,
} from "../controllers/evidence-records.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.get("/", asyncHandler(listSkills));
router.post("/declare", asyncHandler(declareSkill));
router.post("/", asyncHandler(createSkill));
router.post("/sync-evidence-status", asyncHandler(syncAllSkillEvidence));
router.post("/:skillId/evidence/link", asyncHandler(linkEvidenceToSkill));
router.post("/:skillId/evidence/unlink", asyncHandler(unlinkEvidenceFromSkill));
router.get("/:skillId/related-evidence", asyncHandler(getRelatedEvidence));
router.post("/:id/events", asyncHandler(applySkillEvent));
router.post("/:id/sync-evidence-status", asyncHandler(syncSkillEvidence));
router.get("/:id", asyncHandler(getSkill));
router.patch("/:id", asyncHandler(updateSkill));
router.delete("/:id", asyncHandler(deleteSkill));

export default router;

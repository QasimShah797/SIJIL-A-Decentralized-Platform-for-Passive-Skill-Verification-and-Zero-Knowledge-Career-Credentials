import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import {
  downloadOwnerResumePdf,
  downloadOwnerWalletResumePdf,
  getOwnerShareResume,
  getOwnerWalletResume,
  getWalletCompetencies,
  getWalletCompetency,
  revokeWalletShare,
  shareWalletCompetency,
  syncWalletCompetency,
} from "../controllers/wallet.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.get("/competencies", asyncHandler(getWalletCompetencies));
router.get("/competencies/:competencyId", asyncHandler(getWalletCompetency));
router.post("/competencies/:competencyId/sync", asyncHandler(syncWalletCompetency));
router.post("/competencies/:competencyId/share", asyncHandler(shareWalletCompetency));
router.post("/shares/:shareId/revoke", asyncHandler(revokeWalletShare));
router.get("/resume", asyncHandler(getOwnerWalletResume));
router.get("/resume.pdf", asyncHandler(downloadOwnerWalletResumePdf));
router.get("/shares/:shareId/resume", asyncHandler(getOwnerShareResume));
router.get("/shares/:shareId/resume.pdf", asyncHandler(downloadOwnerResumePdf));

export default router;

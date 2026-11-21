import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { rateLimit } from "../middleware/rateLimit.middleware";
import {
  downloadOwnerResumePdf,
  downloadOwnerWalletResumePdf,
  emailPublicShare,
  getDisclosurePreferences,
  getOwnerShareResume,
  updateDisclosurePreferences,
  getOwnerWalletResume,
  getWalletCompetencies,
  getWalletCompetency,
  listOwnerShares,
  listRegisteredRecruiters,
  revokeWalletShare,
  shareWalletCompetency,
  syncWalletCompetency,
} from "../controllers/wallet.controller";
import {
  createPendingCompetencyVersion,
  listMyCompetencyVersions,
  requestCompetencyIssuance,
} from "../controllers/competency-version.controller";

const router = Router();

router.use(authMiddleware, requireLearner);

router.get("/disclosure-preferences", asyncHandler(getDisclosurePreferences));
router.put("/disclosure-preferences", asyncHandler(updateDisclosurePreferences));
router.get("/competencies", asyncHandler(getWalletCompetencies));
router.get("/competencies/:competencyId", asyncHandler(getWalletCompetency));
router.post("/competencies/:competencyId/sync", asyncHandler(syncWalletCompetency));
router.get("/competency-versions", asyncHandler(listMyCompetencyVersions));
router.post("/competency-versions", asyncHandler(createPendingCompetencyVersion));
router.post("/competency-versions/:versionId/request-issuance", asyncHandler(requestCompetencyIssuance));
router.get("/recruiters", asyncHandler(listRegisteredRecruiters));
router.post("/competencies/:competencyId/share", asyncHandler(shareWalletCompetency));
router.get("/shares", asyncHandler(listOwnerShares));
router.post(
  "/shares/:shareId/email",
  rateLimit({ windowMs: 60_000, max: 5 }),
  asyncHandler(emailPublicShare),
);
router.post("/shares/:shareId/revoke", asyncHandler(revokeWalletShare));
router.get("/resume", asyncHandler(getOwnerWalletResume));
router.get("/resume.pdf", asyncHandler(downloadOwnerWalletResumePdf));
router.get("/shares/:shareId/resume", asyncHandler(getOwnerShareResume));
router.get("/shares/:shareId/resume.pdf", asyncHandler(downloadOwnerResumePdf));

export default router;

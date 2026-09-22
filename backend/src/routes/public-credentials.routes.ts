import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { optionalAuthMiddleware } from "../middleware/auth.middleware";
import {
  downloadAppleWalletPass,
  downloadPublicResumePdf,
  getGoogleWalletPass,
  getPublicCompetency,
  getPublicCredential,
  getPublicResumePhoto,
  getWalletExportConfig,
} from "../controllers/wallet.controller";

const router = Router();

router.use(optionalAuthMiddleware);
router.get("/wallet-export/config", asyncHandler(getWalletExportConfig));
router.get("/credentials/:token", asyncHandler(getPublicCredential));
router.get("/credentials/:token/photo", asyncHandler(getPublicResumePhoto));
router.get("/credentials/:token/competencies/:competencyId", asyncHandler(getPublicCompetency));
router.get("/credentials/:token/resume.pdf", asyncHandler(downloadPublicResumePdf));
router.get("/credentials/:token/apple-wallet", asyncHandler(downloadAppleWalletPass));
router.get("/credentials/:token/google-wallet", asyncHandler(getGoogleWalletPass));

export default router;

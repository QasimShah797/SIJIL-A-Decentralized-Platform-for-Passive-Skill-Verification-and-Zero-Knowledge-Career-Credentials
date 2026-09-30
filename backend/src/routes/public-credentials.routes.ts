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
import { getIssuer } from "../controllers/issuers.controller";
import { verifyPublicCredentialById } from "../controllers/credential-verify.controller";
import { PUBLIC_VERIFY_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";

const router = Router();

router.use(optionalAuthMiddleware);
router.get("/issuers/:did", asyncHandler(getIssuer));
router.get("/wallet-export/config", asyncHandler(getWalletExportConfig));
router.get(
  "/credentials/:credentialId/verify",
  rateLimit(PUBLIC_VERIFY_RATE_LIMIT),
  asyncHandler(verifyPublicCredentialById),
);
router.get("/credentials/:token", asyncHandler(getPublicCredential));
router.get("/credentials/:token/photo", asyncHandler(getPublicResumePhoto));
router.get("/credentials/:token/competencies/:competencyId", asyncHandler(getPublicCompetency));
router.get("/credentials/:token/resume.pdf", asyncHandler(downloadPublicResumePdf));
router.get("/credentials/:token/apple-wallet", asyncHandler(downloadAppleWalletPass));
router.get("/credentials/:token/google-wallet", asyncHandler(getGoogleWalletPass));

export default router;

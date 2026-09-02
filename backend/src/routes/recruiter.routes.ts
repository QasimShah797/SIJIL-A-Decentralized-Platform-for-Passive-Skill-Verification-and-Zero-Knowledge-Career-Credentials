/**
 * Recruiter verification and candidate search routes.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireRecruiter } from "../middleware/role.middleware";
import {
  verifyCredential,
  getCandidate,
  searchCandidates,
  getCandidateProfileFields,
} from "../controllers/recruiter.controller";

const router = Router();

router.use(authMiddleware, requireRecruiter);

router.get("/verify/:credentialId", asyncHandler(verifyCredential));
router.get("/candidate/:candidateId", asyncHandler(getCandidate));
router.get("/search", asyncHandler(searchCandidates));
router.get("/candidates/profile-fields", asyncHandler(getCandidateProfileFields));

export default router;

/**
 * Recruiter verification, candidate search, and interview scheduling routes.
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
import {
  scheduleInterview,
  listInterviews,
  cancelInterview,
  resendInterviewEmail,
} from "../controllers/interview.controller";

const router = Router();

router.use(authMiddleware, requireRecruiter);

router.get("/verify/:credentialId", asyncHandler(verifyCredential));
router.get("/candidate/:candidateId", asyncHandler(getCandidate));
router.get("/search", asyncHandler(searchCandidates));
router.get("/candidates/profile-fields", asyncHandler(getCandidateProfileFields));
router.post("/interviews", asyncHandler(scheduleInterview));
router.get("/interviews", asyncHandler(listInterviews));
router.post("/interviews/:id/cancel", asyncHandler(cancelInterview));
router.post("/interviews/:id/resend-email", asyncHandler(resendInterviewEmail));

export default router;

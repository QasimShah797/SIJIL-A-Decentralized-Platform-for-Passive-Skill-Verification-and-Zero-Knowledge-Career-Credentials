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
import {
  verifyAssessmentPolicy,
  verifyRecruiterScoreProof,
} from "../controllers/zkp.controller";
import {
  createRecruiterScoreRequest,
  getRecruiterScoreRequest,
  listRecruiterScoreRequests,
} from "../controllers/zkp-score-request.controller";
import {
  listRecruiterNotifications,
  listRecruiterVerificationRequests,
  markRecruiterNotificationRead,
  createGithubActivityRequest,
} from "../controllers/zkp-notification.controller";
import { createShortlistEntry, deleteShortlistEntry, getShortlist } from "../controllers/recruiter-shortlist.controller";
import { listSharedCompetencyVersions } from "../controllers/competency-version.controller";
import {
  verifyGitHubDisclosure,
  verifyGitHubPolicy,
} from "../controllers/github-zkp.controller";
import { ZKP_VERIFY_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";

const router = Router();

router.use(authMiddleware, requireRecruiter);

router.get("/zkp/notifications", asyncHandler(listRecruiterNotifications));
router.post("/zkp/notifications/:notificationId/read", asyncHandler(markRecruiterNotificationRead));
router.post("/zkp/github-requests", asyncHandler(createGithubActivityRequest));
router.get("/shortlist", asyncHandler(getShortlist));
router.post("/shortlist", asyncHandler(createShortlistEntry));
router.delete("/shortlist/:learnerUserId", asyncHandler(deleteShortlistEntry));
router.get("/candidates/:learnerUserId/competency-versions", asyncHandler(listSharedCompetencyVersions));
router.get("/zkp/verification-requests", asyncHandler(listRecruiterVerificationRequests));

router.post(
  "/zkp/requests",
  rateLimit({ ...ZKP_VERIFY_RATE_LIMIT, key: (req) => req.user?.id || req.ip || "unknown" }),
  asyncHandler(createRecruiterScoreRequest),
);
router.get(
  "/zkp/requests",
  asyncHandler(listRecruiterScoreRequests),
);
router.get(
  "/zkp/requests/:requestId",
  asyncHandler(getRecruiterScoreRequest),
);
router.post(
  "/zkp/verify",
  rateLimit({ ...ZKP_VERIFY_RATE_LIMIT, key: (req) => req.user?.id || req.ip || "unknown" }),
  asyncHandler(verifyRecruiterScoreProof),
);
router.post(
  "/zkp/policy/verify",
  rateLimit({ ...ZKP_VERIFY_RATE_LIMIT, key: (req) => req.user?.id || req.ip || "unknown" }),
  asyncHandler(verifyAssessmentPolicy),
);
router.post(
  "/github-zkp/verify",
  rateLimit({ ...ZKP_VERIFY_RATE_LIMIT, key: (req) => req.user?.id || req.ip || "unknown" }),
  asyncHandler(verifyGitHubDisclosure),
);
router.post(
  "/github-zkp/policy/verify",
  rateLimit({ ...ZKP_VERIFY_RATE_LIMIT, key: (req) => req.user?.id || req.ip || "unknown" }),
  asyncHandler(verifyGitHubPolicy),
);
router.get("/verify/:credentialId", asyncHandler(verifyCredential));
router.get("/candidate/:candidateId", asyncHandler(getCandidate));
router.get("/search", asyncHandler(searchCandidates));
router.get("/candidates/profile-fields", asyncHandler(getCandidateProfileFields));
router.post("/interviews", asyncHandler(scheduleInterview));
router.get("/interviews", asyncHandler(listInterviews));
router.post("/interviews/:id/cancel", asyncHandler(cancelInterview));
router.post("/interviews/:id/resend-email", asyncHandler(resendInterviewEmail));

export default router;

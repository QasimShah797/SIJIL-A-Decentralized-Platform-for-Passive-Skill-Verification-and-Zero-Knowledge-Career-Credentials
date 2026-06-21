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
} from "../controllers/recruiter.controller";

const router = Router();

router.use(authMiddleware, requireRecruiter);

router.get("/verify/:credentialId", asyncHandler(verifyCredential));
router.get("/candidate/:candidateId", asyncHandler(getCandidate));
router.get("/search", asyncHandler(searchCandidates));

export default router;

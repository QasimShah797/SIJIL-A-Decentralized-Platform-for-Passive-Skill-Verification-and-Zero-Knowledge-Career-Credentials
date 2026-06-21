/**
 * Attestation workflow routes — institution queue and decisions.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireInstitution } from "../middleware/role.middleware";
import {
  getAttestationQueue,
  approveAttestation,
  rejectAttestation,
  clarificationAttestation,
} from "../controllers/attestation.controller";

const router = Router();

router.use(authMiddleware, requireInstitution);

router.get("/queue", asyncHandler(getAttestationQueue));
router.post("/approve", asyncHandler(approveAttestation));
router.post("/reject", asyncHandler(rejectAttestation));
router.post("/clarification", asyncHandler(clarificationAttestation));

export default router;

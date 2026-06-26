/**
 * Public student activation routes (no JWT — token proves identity).
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  activateStudentAccount,
  previewStudentActivation,
} from "../controllers/student-activation.controller";

const router = Router();

router.get("/preview", asyncHandler(previewStudentActivation));
router.post("/activate", asyncHandler(activateStudentAccount));

export default router;

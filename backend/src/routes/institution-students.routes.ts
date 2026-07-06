/**
 * Institution student provisioning routes.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireInstitution } from "../middleware/role.middleware";
import {
  createInstitutionStudent,
  listInstitutionStudents,
} from "../controllers/institution-students.controller";

const router = Router();

router.use(authMiddleware, requireInstitution);

router.get("/students", asyncHandler(listInstitutionStudents));
router.post("/students", asyncHandler(createInstitutionStudent));

export default router;

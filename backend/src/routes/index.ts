/**
 * Central API router — mounts all domain route modules under /api.
 */
import { Router } from "express";
import healthRoutes from "./health.routes";
import skillsRoutes from "./skills.routes";
import evidenceRoutes from "./evidence.routes";
import attestationRoutes from "./attestation.routes";
import credentialsRoutes from "./credentials.routes";
import recruiterRoutes from "./recruiter.routes";
import integrationsRoutes from "./integrations.routes";
import reviewsRoutes from "./reviews.routes";
import peerReviewRoutes from "./peer-review.routes";
import institutionStudentsRoutes from "./institution-students.routes";
import studentActivationRoutes from "./student-activation.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/skills", skillsRoutes);
router.use("/evidence", evidenceRoutes);
router.use("/attestation", attestationRoutes);
router.use("/credentials", credentialsRoutes);
router.use("/recruiter", recruiterRoutes);
router.use("/integrations", integrationsRoutes);
router.use("/github", integrationsRoutes);
router.use("/reviews", reviewsRoutes);
router.use("/peer-review", peerReviewRoutes);
router.use("/institution", institutionStudentsRoutes);
router.use("/student-activation", studentActivationRoutes);

export default router;

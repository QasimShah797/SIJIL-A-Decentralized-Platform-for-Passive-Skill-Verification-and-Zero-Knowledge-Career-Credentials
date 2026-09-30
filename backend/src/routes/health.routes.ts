/**
 * Health check routes — public liveness; outbox counts require admin.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/role.middleware";
import { healthCheck, healthOutbox } from "../controllers/health.controller";

const router = Router();

router.get("/", asyncHandler(async (req, res) => healthCheck(req, res)));
router.get("/outbox", authMiddleware, requireAdmin, asyncHandler(async (req, res) => healthOutbox(req, res)));

export default router;

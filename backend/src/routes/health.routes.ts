/**
 * Health check route — public endpoint, no auth required.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { healthCheck } from "../controllers/health.controller";

const router = Router();

router.get("/", asyncHandler(async (req, res) => healthCheck(req, res)));

export default router;

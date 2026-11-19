/**
 * Google Calendar admin OAuth routes (Phase 1).
 * Mounted at /api/integrations/google-calendar
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/role.middleware";
import {
  disconnectGoogleCalendar,
  googleCalendarConnectionStatus,
  googleCalendarOAuthCallback,
  startGoogleCalendarConnect,
} from "../controllers/google-calendar-oauth.controller";

const router = Router();

// Google browser redirect — no JWT. CSRF protected via one-time state.
router.get("/callback", asyncHandler(googleCalendarOAuthCallback));

router.get("/connect", authMiddleware, requireAdmin, asyncHandler(startGoogleCalendarConnect));
router.get("/status", authMiddleware, requireAdmin, asyncHandler(googleCalendarConnectionStatus));
router.delete("/disconnect", authMiddleware, requireAdmin, asyncHandler(disconnectGoogleCalendar));

export default router;

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireLearner } from "../middleware/role.middleware";
import { PUBLIC_VERIFY_RATE_LIMIT, rateLimit } from "../middleware/rateLimit.middleware";
import {
  bindSsiIdentity,
  createSsiChallenge,
  getSsiIdentity,
  resolveSsiDid,
} from "../controllers/ssi.controller";
import {
  createPresentationChallenge,
  revokeLearnerPresentation,
  submitLearnerPresentation,
} from "../controllers/ssi-presentation.controller";

const router = Router();

router.get(
  "/resolve",
  rateLimit(PUBLIC_VERIFY_RATE_LIMIT),
  asyncHandler(resolveSsiDid),
);

router.use(authMiddleware, requireLearner);

router.post(
  "/challenge",
  rateLimit({ windowMs: 60_000, max: 10 }),
  asyncHandler(createSsiChallenge),
);
router.get("/identity", asyncHandler(getSsiIdentity));
router.post(
  "/bind",
  rateLimit({ windowMs: 60_000, max: 10 }),
  asyncHandler(bindSsiIdentity),
);
router.post(
  "/presentations/challenge",
  rateLimit({ windowMs: 60_000, max: 10 }),
  asyncHandler(createPresentationChallenge),
);
router.post(
  "/presentations",
  rateLimit({ windowMs: 60_000, max: 10 }),
  asyncHandler(submitLearnerPresentation),
);
router.post(
  "/presentations/:id/revoke",
  rateLimit({ windowMs: 60_000, max: 20 }),
  asyncHandler(revokeLearnerPresentation),
);

export default router;

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getPublicPresentation,
  verifyPublicPresentation,
} from "../controllers/wallet.controller";

const router = Router();

router.get("/:token", asyncHandler(getPublicPresentation));
router.post("/:token/verify", asyncHandler(verifyPublicPresentation));

export default router;

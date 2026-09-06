import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { githubSignIn } from "../controllers/github-signin.controller";

const router = Router();

router.post("/github-signin", asyncHandler(githubSignIn));

export default router;

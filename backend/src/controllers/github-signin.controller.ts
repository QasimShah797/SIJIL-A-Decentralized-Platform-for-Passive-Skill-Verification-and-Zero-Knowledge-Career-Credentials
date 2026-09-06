import { Request, Response } from "express";
import { completeGitHubSignIn } from "../services/github-signin.service";
import { AppError } from "../utils/AppError";
import { sendSuccess } from "../utils/apiResponse";

export async function githubSignIn(req: Request, res: Response): Promise<Response> {
  const code = String(req.body?.code ?? "").trim();
  const state = String(req.body?.state ?? "").trim();
  const redirectUri = String(req.body?.redirect_uri ?? "").trim();
  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : undefined;

  if (!code || !state || !redirectUri) {
    throw new AppError("Missing GitHub sign-in parameters.", 400);
  }

  const data = await completeGitHubSignIn({ code, state, redirectUri, clientId });
  return sendSuccess(res, data, "GitHub sign-in ready");
}

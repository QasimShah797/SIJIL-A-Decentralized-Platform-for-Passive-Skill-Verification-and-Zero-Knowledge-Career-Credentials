import { Request, Response } from "express";
import { env } from "../config/env";
import { sendSuccess } from "../utils/apiResponse";
import { ssiPresentationService } from "../services/ssi-presentation.live";
import {
  ssiPresentationChallengeSchema,
  ssiPresentationSubmitSchema,
} from "../validators/ssi.validator";
import { paramString } from "../utils/params";

function verifyUrl(presentationId: string): string {
  const origin = env.FRONTEND_URL.replace(/\/$/, "");
  return `${origin}/verify/vp/${encodeURIComponent(presentationId)}`;
}

export async function createPresentationChallenge(req: Request, res: Response): Promise<Response> {
  const input = ssiPresentationChallengeSchema.parse(req.body);
  const record = await ssiPresentationService.issueChallenge(req.user!.id, input);
  return sendSuccess(res, ssiPresentationService.challengeView(record), "Presentation challenge issued", 201);
}

export async function submitLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const input = ssiPresentationSubmitSchema.parse(req.body);
  const stored = await ssiPresentationService.submit(req.user!.id, input);
  return sendSuccess(res, {
    presentationId: stored.id,
    holderDid: stored.holderDid,
    verifyUrl: verifyUrl(stored.id),
    kind: "learner-signed-vp",
  }, "Learner-signed presentation created", 201);
}

export async function getPublicLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const id = paramString(req.params.id, "id");
  const stored = ssiPresentationService.getEnvelope(id);
  const verification = await ssiPresentationService.verify(id);
  return sendSuccess(res, {
    presentationId: stored.id,
    holderDid: stored.holderDid,
    envelope: stored.envelope,
    verification,
    kind: "learner-signed-vp",
  });
}

export async function verifyPublicLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const id = paramString(req.params.id, "id");
  const verification = await ssiPresentationService.verify(id);
  return sendSuccess(res, verification);
}

import { Request, Response } from "express";
import { env } from "../config/env";
import { sendSuccess } from "../utils/apiResponse";
import { ssiPresentationService } from "../services/ssi-presentation.live";
import {
  disclosurePreferencesStore,
} from "../services/disclosure-preferences.service";
import { redactExactValues } from "../utils/exact-value-redaction";
import {
  ssiPresentationChallengeSchema,
  ssiPresentationSubmitSchema,
} from "../validators/ssi.validator";
import { paramString } from "../utils/params";

function verifyUrl(presentationId: string): string {
  const origin = env.FRONTEND_URL.replace(/\/$/, "");
  return `${origin}/verify/vp/${encodeURIComponent(presentationId)}`;
}

async function publicPresentationPayload(presentationId: string) {
  // getEnvelope rejects revoked before any envelope / credential reconstruction.
  const stored = await ssiPresentationService.getEnvelope(presentationId);
  const verification = await ssiPresentationService.verify(presentationId);
  // Fail closed on disclosure prefs: store defaults OFF / errors → withheld.
  const prefs = await disclosurePreferencesStore().get(stored.learnerUserId);
  return redactExactValues(
    {
      presentationId: stored.id,
      holderDid: stored.holderDid,
      // Only credentials cryptographically bound into this VP are present.
      envelope: stored.envelope,
      verification,
      kind: "learner-signed-vp",
    },
    prefs,
    new Date().toISOString(),
  );
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

export async function revokeLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const id = paramString(req.params.id, "id");
  const result = await ssiPresentationService.revoke(req.user!.id, id);
  return sendSuccess(res, {
    presentationId: result.presentationId,
    revokedAt: result.revokedAt,
    alreadyRevoked: result.alreadyRevoked,
    kind: "learner-signed-vp",
  }, result.alreadyRevoked ? "Presentation already revoked" : "Presentation revoked");
}

export async function getPublicLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const id = paramString(req.params.id, "id");
  return sendSuccess(res, await publicPresentationPayload(id));
}

export async function verifyPublicLearnerPresentation(req: Request, res: Response): Promise<Response> {
  const id = paramString(req.params.id, "id");
  const stored = await ssiPresentationService.getEnvelope(id);
  const verification = await ssiPresentationService.verify(id);
  const prefs = await disclosurePreferencesStore().get(stored.learnerUserId);
  return sendSuccess(
    res,
    redactExactValues({ ...verification }, prefs, new Date().toISOString()),
  );
}

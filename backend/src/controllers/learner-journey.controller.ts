/**
 * Learner longitudinal journey HTTP handler (Phase 1).
 * Identity is always req.user.id — never a client-supplied learner id.
 */
import type { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { runWithUserDb } from "../config/supabase";
import { learnerJourneyQuerySchema } from "../validators/learner-journey.validator";
import { learnerJourneyService } from "../services/learner-journey.service";

export async function getJourney(req: Request, res: Response): Promise<Response> {
  const query = learnerJourneyQuerySchema.parse(req.query);
  const learnerUserId = req.user!.id;
  const data = await runWithUserDb(req.accessToken, () =>
    learnerJourneyService.getJourney(learnerUserId, query),
  );
  return sendSuccess(res, data);
}

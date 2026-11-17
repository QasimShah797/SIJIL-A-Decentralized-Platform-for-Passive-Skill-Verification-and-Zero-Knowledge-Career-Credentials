import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";
import { paramString } from "../utils/params";
import { isMissingRelationError } from "../utils/supabase-errors";
import { addShortlist, listShortlist, removeShortlist, shortlistAvailable } from "../services/recruiter-shortlist";

const addSchema = z.object({
  learnerUserId: z.string().uuid(),
  note: z.string().max(500).optional(),
}).strict();

export async function getShortlist(req: Request, res: Response): Promise<Response> {
  if (!await shortlistAvailable()) return sendSuccess(res, { available: false, entries: [] });
  return sendSuccess(res, { available: true, entries: await listShortlist(req.user!.id) });
}

export async function createShortlistEntry(req: Request, res: Response): Promise<Response> {
  const body = addSchema.parse(req.body ?? {});
  try {
    const entry = await addShortlist(req.user!.id, body.learnerUserId, body.note ?? "");
    return sendSuccess(res, entry, "Shortlist updated", 201);
  } catch (err) {
    if (isMissingRelationError(err)) throw new AppError("Shortlists are not available until the shortlist table is applied.", 503);
    throw err;
  }
}

export async function deleteShortlistEntry(req: Request, res: Response): Promise<Response> {
  await removeShortlist(req.user!.id, paramString(req.params.learnerUserId, "learnerUserId"));
  return sendSuccess(res, { removed: true });
}

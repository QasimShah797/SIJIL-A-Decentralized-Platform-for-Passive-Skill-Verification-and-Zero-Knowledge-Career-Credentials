/**
 * GitHub integration HTTP handlers — sync and list GitHub evidence records.
 */
import { Request, Response } from "express";
import { githubSyncService } from "../services/github-sync.service";
import { evidenceRecordsService } from "../services/evidence-records.service";
import { supabaseService } from "../services/supabase.service";
import { sendSuccess } from "../utils/apiResponse";
import { githubSyncSchema } from "../validators/github.validator";
import { reviewsService } from "../services/reviews.service";

export async function getLinkedProjectEvidence(req: Request, res: Response): Promise<Response> {
  const records = await evidenceRecordsService.listLinkedProjectEvidence(req.user!.id);
  return sendSuccess(res, records);
}

export async function syncGitHub(req: Request, res: Response): Promise<Response> {
  const body = githubSyncSchema.parse(req.body ?? {});

  let declaredSkills = body.declaredSkills;
  if (!declaredSkills?.length) {
    const { data: skills } = await supabaseService.client
      .from("declared_skills")
      .select("id, name, domain")
      .eq("user_id", req.user!.id);
    declaredSkills = (skills ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      domain: (s.domain as string | null) ?? undefined,
    }));
  }

  const result = await githubSyncService.sync(req.user!.id, declaredSkills);

  try {
    await evidenceRecordsService.autoLinkStrongMatchesForAllSkills(req.user!.id);
  } catch {
    // Auto-link is best-effort after sync.
  }

  try {
    await reviewsService.importExternalForUser(req.user!.id);
  } catch {
    // External review import is best-effort after sync.
  }

  return sendSuccess(res, result, "GitHub sync completed");
}

export async function getGitHubEvidence(req: Request, res: Response): Promise<Response> {
  const records = await evidenceRecordsService.listGitHubEvidence(req.user!.id);
  return sendSuccess(res, records);
}

export async function getSyncStatus(req: Request, res: Response): Promise<Response> {
  const status = await githubSyncService.getLatestSyncStatus(req.user!.id);
  return sendSuccess(res, { status });
}

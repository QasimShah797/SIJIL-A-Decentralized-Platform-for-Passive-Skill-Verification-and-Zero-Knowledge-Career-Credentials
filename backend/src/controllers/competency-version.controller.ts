import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";
import { paramString } from "../utils/params";
import { isMissingRelationError } from "../utils/supabase-errors";
import { getServiceSupabase } from "../config/supabase";
import { shareVisibleToRecruiter } from "../services/share-directory";
import { publicRecruiterVersion, recruiterMaySeeVersion } from "../services/competency-version";
import { reviewerRequestIsNotIssuerAuthority } from "../services/versioned-issuance";
import {
  competencyVersionsAvailable,
  listLearnerVersions,
  issueValidatedCompetencyVersion,
  recordPendingImprovement,
  refuseLearnerIssuance,
} from "../services/competency-version.store";

const pendingSchema = z.object({
  skillName: z.string().trim().min(2).max(80),
  evidenceSource: z.enum(["github", "moodle", "practical"]),
  evidenceReference: z.string().trim().min(3).max(200),
  evidenceSummary: z.string().trim().min(8).max(500),
}).strict();

function asAppError(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (isMissingRelationError(err)) throw new AppError("Competency versions are not available until the version table is applied.", 503);
  const statusCode = typeof err === "object" && err && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 400;
  const message = err instanceof Error ? err.message : "The competency version could not be updated.";
  throw new AppError(message === "not found" ? "Competency version not found" : message, message === "not found" ? 404 : statusCode || 400);
}

export async function listMyCompetencyVersions(req: Request, res: Response): Promise<Response> {
  if (!await competencyVersionsAvailable()) return sendSuccess(res, { available: false, versions: [] });
  const versions = await listLearnerVersions(req.user!.id);
  return sendSuccess(res, { available: true, versions });
}

export async function createPendingCompetencyVersion(req: Request, res: Response): Promise<Response> {
  const body = pendingSchema.parse(req.body ?? {});
  try {
    const version = await recordPendingImprovement(req.user!.id, body.skillName, body.evidenceSource, body.evidenceReference, body.evidenceSummary);
    return sendSuccess(res, version, "New evidence recorded. A credential was not issued.", 201);
  } catch (err) {
    asAppError(err);
  }
}

export async function requestCompetencyIssuance(req: Request, res: Response): Promise<Response> {
  const versionId = paramString(req.params.versionId, "versionId");
  const existing = await listLearnerVersions(req.user!.id);
  const version = existing.find((row) => row.id === versionId);
  if (!version) throw new AppError("Competency version not found", 404);
  try {
    refuseLearnerIssuance(req.user!.id, version, existing);
  } catch (err) {
    asAppError(err);
  }
}

const issuerSchema = z.object({ learnerUserId: z.string().uuid() }).strict();

export async function issueValidatedCompetencyVersionForLearner(req: Request, res: Response): Promise<Response> {
  reviewerRequestIsNotIssuerAuthority((req.body ?? {}) as Record<string, unknown>);
  const body = issuerSchema.parse(req.body ?? {});
  const versionId = paramString(req.params.versionId, "versionId");
  try {
    const version = await issueValidatedCompetencyVersion(body.learnerUserId, versionId);
    return sendSuccess(res, {
      id: version.id,
      versionNumber: version.versionNumber,
      credentialId: version.credentialId,
      status: version.status,
      anchorStatus: version.anchorStatus,
    }, "Signed credential version recorded");
  } catch (err) {
    asAppError(err);
  }
}

export async function listSharedCompetencyVersions(req: Request, res: Response): Promise<Response> {
  const learnerUserId = paramString(req.params.learnerUserId, "learnerUserId");
  if (!await competencyVersionsAvailable()) return sendSuccess(res, { available: false, versions: [] });
  const { data, error } = await getServiceSupabase()
    .from("selective_disclosure_presentations")
    .select("expires_at, revoked_at, disclosed_payload")
    .eq("learner_id", learnerUserId)
    .is("revoked_at", null)
    .limit(100);
  if (error || !(data ?? []).some((row) => shareVisibleToRecruiter({
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    disclosedPayload: row.disclosed_payload,
    recruiterUserId: req.user!.id,
  }))) {
    throw new AppError("This learner has not shared a profile with you.", 403);
  }
  const skill = typeof req.query.skill === "string" ? req.query.skill.trim().toLowerCase() : "";
  const payloads = (data ?? [])
    .filter((row) => shareVisibleToRecruiter({
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      disclosedPayload: row.disclosed_payload,
      recruiterUserId: req.user!.id,
    }))
    .map((row) => row.disclosed_payload);
  const versions = (await listLearnerVersions(learnerUserId))
    .filter((row) => {
      const name = row.skillName.toLowerCase();
      if (skill && name !== skill && row.competencyKey !== skill) return false;
      return recruiterMaySeeVersion(row, payloads);
    })
    .map(publicRecruiterVersion);
  return sendSuccess(res, { available: true, versions });
}

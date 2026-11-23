/**
 * Recruiter credential verify — same service as GET /public/credentials/:id/verify.
 * Selective disclosure: only credentials covered by an active share for this recruiter.
 */
import { AppError } from "../utils/AppError";
import type { CredentialVerifyResult } from "./credential-verify";
import { isActiveShareRow } from "./learner-access";
import { shareVisibleToRecruiter } from "./share-directory";

export type RecruiterVerifyShareRow = {
  revokedAt?: string | null;
  expiresAt?: string | null;
  disclosedPayload?: unknown;
  competencyId?: string | null;
};

export function sharePayloadMentionsCredential(
  payload: unknown,
  credentialId: string,
  skillName?: string | null,
): boolean {
  if (!credentialId.trim()) return false;
  const text = JSON.stringify(payload ?? "");
  if (text.includes(credentialId)) return true;

  const wanted = (skillName ?? "").trim().toLowerCase();
  if (!wanted) return false;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const row = payload as Record<string, unknown>;
  const competency = row.competency && typeof row.competency === "object" && !Array.isArray(row.competency)
    ? row.competency as Record<string, unknown>
    : null;
  const competencyName = typeof competency?.name === "string" ? competency.name.trim().toLowerCase() : "";
  if (competencyName && (competencyName === wanted || competencyName.includes(wanted) || wanted.includes(competencyName))) {
    return true;
  }

  const skills = Array.isArray(row.skills) ? row.skills : [];
  for (const skill of skills) {
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) continue;
    const name = typeof (skill as Record<string, unknown>).name === "string"
      ? String((skill as Record<string, unknown>).name).trim().toLowerCase()
      : "";
    if (name && (name === wanted || name.includes(wanted) || wanted.includes(name))) return true;
  }
  return false;
}

export function classifyRecruiterCredentialAccess(input: {
  recruiterUserId: string;
  credentialId: string;
  skillName?: string | null;
  competencyId?: string | null;
  shares: RecruiterVerifyShareRow[];
  now?: Date;
}): "allowed" | "expired" | "revoked" | "forbidden" {
  const now = input.now ?? new Date();
  const related = input.shares.filter((share) => {
    if (
      input.competencyId
      && share.competencyId
      && share.competencyId === input.competencyId
    ) {
      return true;
    }
    return sharePayloadMentionsCredential(share.disclosedPayload, input.credentialId, input.skillName);
  });

  if (!related.length) return "forbidden";

  const activeVisible = related.filter((share) =>
    shareVisibleToRecruiter({
      revokedAt: share.revokedAt,
      expiresAt: share.expiresAt,
      disclosedPayload: share.disclosedPayload,
      recruiterUserId: input.recruiterUserId,
      now,
    }),
  );
  if (activeVisible.length) return "allowed";

  if (related.some((share) => Boolean(share.revokedAt))) return "revoked";

  if (related.some((share) =>
    !isActiveShareRow({
      revokedAt: share.revokedAt,
      expiresAt: share.expiresAt,
      now,
    }) && !share.revokedAt
  )) {
    return "expired";
  }

  return "forbidden";
}

export function assertRecruiterCredentialAccess(
  access: ReturnType<typeof classifyRecruiterCredentialAccess>,
): void {
  if (access === "allowed") return;
  if (access === "expired") throw new AppError("This share has expired", 410);
  if (access === "revoked") throw new AppError("This share was revoked", 410);
  throw new AppError("Not authorized to verify this credential", 403);
}

export async function recruiterVerifyCredential(
  credentialId: string,
  deps: {
    lookupPresentation: (token: string) => Promise<string | null>;
    verify: (id: string) => Promise<CredentialVerifyResult>;
  },
): Promise<CredentialVerifyResult> {
  const resolved = (await deps.lookupPresentation(credentialId)) ?? credentialId;
  return deps.verify(resolved);
}

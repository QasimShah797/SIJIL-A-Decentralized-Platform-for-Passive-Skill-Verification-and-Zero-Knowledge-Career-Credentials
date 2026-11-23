/**
 * Per-credential evidence presence for selective disclosure / ZKP sharing.
 * Mirrors backend assessEvidenceShareAvailability — only linked evidence for the
 * selected competency may appear as a share card.
 */
import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";

export type EvidenceShareMode = "details" | "private" | "omit";

export type EvidenceModes = {
  practical_task_result: EvidenceShareMode;
  github_evidence: EvidenceShareMode;
  lms_evidence: EvidenceShareMode;
  peer_reviews: EvidenceShareMode;
};

export type EvidenceFieldAvailability = {
  present: boolean;
  privateAllowed: boolean;
  privateBlockedReason: string | null;
};

export type EvidenceShareAvailability = Record<keyof EvidenceModes, EvidenceFieldAvailability>;

export const OMIT_EVIDENCE_MODES: EvidenceModes = {
  practical_task_result: "omit",
  github_evidence: "omit",
  lms_evidence: "omit",
  peer_reviews: "omit",
};

type EvidencePackageLike = {
  practicalTask?: {
    latestAttempt?: { status?: string; passed?: boolean; scorePercent?: number | null } | null;
    attemptHistory?: Array<{ status?: string; passed?: boolean; scorePercent?: number | null }>;
  };
  github?: {
    repos?: unknown[];
    activities?: unknown[];
    evidenceRecords?: unknown[];
    reviews?: unknown[];
  };
  lms?: {
    evidence?: unknown[];
    courses?: unknown[];
    assignments?: unknown[];
  };
  peerReviews?: unknown[];
};

/** Resolve legacy name-only credentials without guessing between similar or duplicate records. */
export function findUniqueWalletSkill<T extends { competencyName: string }>(rows: readonly T[], skill: string): T | undefined {
  const name = skill.trim().toLowerCase();
  if (!name) return undefined;
  const matches = rows.filter((row) => row.competencyName.trim().toLowerCase() === name);
  return matches.length === 1 ? matches[0] : undefined;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function peerCandidates(pkg: EvidencePackageLike): unknown[] {
  const peers = asList(pkg.peerReviews);
  const githubReviews = asList(pkg.github?.reviews);
  const out: unknown[] = [...peers];
  for (const item of githubReviews) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const origin = String(row.origin ?? "").toLowerCase();
    const role = String(row.reviewer_role ?? "").toLowerCase();
    const hasHumanFeedback = Boolean(row.review_text || row.comment || row.recommendation || row.decision);
    if (origin.includes("form review") || origin.includes("sijil") || role.includes("collaborator") || hasHumanFeedback) {
      out.push(item);
    }
  }
  return out;
}

export function assessEvidenceShareAvailability(
  evidencePackage: EvidencePackageLike | null | undefined,
): EvidenceShareAvailability {
  const pkg = evidencePackage ?? {};
  const latest = pkg.practicalTask?.latestAttempt
    ?? pkg.practicalTask?.attemptHistory?.[0]
    ?? null;
  const practicalPresent = Boolean(latest);
  const practicalPrivate = practicalPresent && (
    latest?.passed === true
    || (typeof latest?.scorePercent === "number" && Number.isFinite(latest.scorePercent))
    || String(latest?.status ?? "").toLowerCase().includes("pass")
  );

  const repos = asList(pkg.github?.repos);
  const activities = asList(pkg.github?.activities);
  const githubEvidenceRecords = asList(pkg.github?.evidenceRecords);
  const githubPresent = repos.length > 0 || activities.length > 0 || githubEvidenceRecords.length > 0;
  const githubPrivate = repos.length > 0;

  const courses = asList(pkg.lms?.courses);
  const assignments = asList(pkg.lms?.assignments);
  const lmsEvidence = asList(pkg.lms?.evidence);
  const lmsPresent = courses.length > 0 || assignments.length > 0 || lmsEvidence.length > 0;
  const lmsPrivate = assignments.length > 0;

  const peers = peerCandidates(pkg);
  const peerPresent = peers.length > 0;

  return {
    practical_task_result: {
      present: practicalPresent,
      privateAllowed: practicalPrivate,
      privateBlockedReason: practicalPresent && !practicalPrivate
        ? "Private verification needs a completed practical result for this credential."
        : null,
    },
    github_evidence: {
      present: githubPresent,
      privateAllowed: githubPrivate,
      privateBlockedReason: githubPresent && !githubPrivate
        ? "Private verification needs a repository linked to this credential."
        : null,
    },
    lms_evidence: {
      present: lmsPresent,
      privateAllowed: lmsPrivate,
      privateBlockedReason: lmsPresent && !lmsPrivate
        ? "Private verification needs Moodle assignments linked to this credential."
        : null,
    },
    peer_reviews: {
      present: peerPresent,
      privateAllowed: peerPresent,
      privateBlockedReason: null,
    },
  };
}

/** Default modes: private when allowed, else details when present, else omit. */
export function defaultEvidenceModesForAvailability(
  availability: EvidenceShareAvailability,
): EvidenceModes {
  const next = { ...OMIT_EVIDENCE_MODES };
  if (!ZKP_UI_ENABLED) return next;
  (Object.keys(next) as Array<keyof EvidenceModes>).forEach((field) => {
    const avail = availability[field];
    if (!avail.present) {
      next[field] = "omit";
    } else if (avail.privateAllowed) {
      next[field] = "private";
    } else {
      next[field] = "details";
    }
  });
  return next;
}

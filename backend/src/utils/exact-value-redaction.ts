/**
 * Server-side enforcement of learner exact-value disclosure permissions for recruiter payloads.
 * Runs on every recruiter read so a permission change applies to existing shares immediately.
 */
import type { DisclosurePreferences } from "../services/disclosure-preferences.service";

const ASSESSMENT_MARK_KEYS = new Set([
  "score",
  "scorePercent",
  "score_percent",
  "percentage",
  "resultPercentage",
  "result_percentage",
  "rawScore",
  "raw_score",
  "maxScore",
  "max_score",
  "marks",
  "grade",
  "grade_max",
  "gradeMax",
  "grade_formatted",
  "gradeFormatted",
  "finalGrade",
  "final_grade",
]);

const NEVER_DISCLOSE_KEYS = new Set([
  "scoreThresholdSignals",
  "blinding",
  "opening",
  "privateKey",
  "private_key",
  "witness",
  "secret",
]);

const GITHUB_COUNT_KEYS = new Set([
  "commit_count",
  "commitCount",
  "commits",
  "commitsCount",
  "total_commits",
  "totalCommits",
  "verifiedCommitCount",
  "uniqueCommitCount",
  "unique_commit_count",
  "contributionCount",
  "contribution_count",
  "verified_commit_count",
]);

export interface ExactValueDisclosureMeta {
  assessmentMarks: "disclosed" | "withheld";
  githubCommitCount: "disclosed" | "withheld";
  source: "sijil_backend_records";
  asOf: string;
}

function isCommitActivity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const type = typeof row.activity_type === "string" ? row.activity_type : row.type;
  return (typeof type === "string" && /commit/i.test(type)) || typeof row.commit_hash === "string";
}

function walk(value: unknown, prefs: Pick<DisclosurePreferences, "shareExactAssessmentMarks" | "shareExactGithubCommitCount">, githubPrivate = false): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, prefs, githubPrivate));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (NEVER_DISCLOSE_KEYS.has(key)) continue;
    if (githubPrivate && key === "github") continue;
    if (!prefs.shareExactAssessmentMarks && ASSESSMENT_MARK_KEYS.has(key)) continue;
    if (!prefs.shareExactGithubCommitCount && GITHUB_COUNT_KEYS.has(key)) continue;
    // Individual commit rows would let a recruiter count commits exactly.
    if (!prefs.shareExactGithubCommitCount && key === "activities" && Array.isArray(child)) {
      out[key] = child.filter((item) => !isCommitActivity(item)).map((item) => walk(item, prefs, githubPrivate));
      continue;
    }
    out[key] = walk(child, prefs, githubPrivate);
  }
  return out;
}

function hasPrivateGithubMode(payload: Record<string, unknown>): boolean {
  const modes = payload.evidenceModes as { github_evidence?: unknown } | undefined;
  return modes?.github_evidence === "private";
}

export function enforcePrivateGithubDisclosure(payload: Record<string, unknown>): Record<string, unknown> {
  if (!hasPrivateGithubMode(payload)) return payload;
  return walk(payload, { shareExactAssessmentMarks: true, shareExactGithubCommitCount: false }, true) as Record<string, unknown>;
}

export function redactExactValues(
  payload: Record<string, unknown>,
  prefs: DisclosurePreferences,
  _asOf: string,
): Record<string, unknown> {
  // Strip any client- or legacy-supplied marker. Recipient payloads do not need
  // exactValueDisclosure metadata for verification or rendering — redaction is
  // enforced by removing the values themselves.
  const { exactValueDisclosure: _ignored, ...rest } = payload;
  const githubPrivate = hasPrivateGithubMode(rest);
  return walk(rest, {
    ...prefs,
    shareExactGithubCommitCount: !githubPrivate && prefs.shareExactGithubCommitCount,
  }, githubPrivate) as Record<string, unknown>;
}

/** Test/helper: describe current preference state without attaching it to payloads. */
export function exactValueDisclosureMeta(
  prefs: DisclosurePreferences,
  asOf: string,
): ExactValueDisclosureMeta {
  return {
    assessmentMarks: prefs.shareExactAssessmentMarks ? "disclosed" : "withheld",
    githubCommitCount: prefs.shareExactGithubCommitCount ? "disclosed" : "withheld",
    source: "sijil_backend_records",
    asOf,
  };
}

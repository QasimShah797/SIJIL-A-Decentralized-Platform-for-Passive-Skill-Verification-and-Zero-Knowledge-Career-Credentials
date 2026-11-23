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
]);

/** Package-summary bands shown without revealing the exact mark. */
export const SCORE_THRESHOLD_BANDS = [60, 70, 80] as const;
export const PACKAGE_REFERENCE_THRESHOLD = 70;

export type ScoreThresholdSide = "above" | "below";

export type ScoreThresholdSignals = {
  referenceThreshold: typeof PACKAGE_REFERENCE_THRESHOLD;
  latestVsReference: ScoreThresholdSide;
  bands: Record<string, ScoreThresholdSide>;
  sittings: number;
  status: string | null;
  passed: boolean | null;
};

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function attemptScore(row: Record<string, unknown>): number | null {
  return asNumber(row.scorePercent)
    ?? asNumber(row.score_percent)
    ?? asNumber(row.percentage)
    ?? asNumber(row.score)
    ?? asNumber(row.resultPercentage);
}

function attemptTime(row: Record<string, unknown>): number {
  const raw = row.submittedAt ?? row.submitted_at ?? row.updated_at ?? row.created_at;
  if (typeof raw !== "string") return 0;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function collectAttempts(practical: Record<string, unknown>): Record<string, unknown>[] {
  const latest = asRecord(practical.latestAttempt);
  const history = Array.isArray(practical.attemptHistory)
    ? practical.attemptHistory.flatMap((item) => {
      const row = asRecord(item);
      return row ? [row] : [];
    })
    : [];
  // Flat practicalTask rows (score on the object itself) count as one sitting.
  const selfScore = attemptScore(practical);
  const selfRow = selfScore != null && !latest
    ? [{
      title: typeof practical.title === "string" ? practical.title : "Practical task",
      status: typeof practical.status === "string" ? practical.status : null,
      passed: typeof practical.passed === "boolean" ? practical.passed : null,
      scorePercent: selfScore,
      submittedAt: practical.submittedAt ?? practical.submitted_at ?? null,
    } as Record<string, unknown>]
    : [];
  const rows = [...(latest ? [latest] : []), ...history, ...selfRow];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(row.attemptId ?? row.attempt_id ?? `${row.title}:${row.submittedAt ?? row.submitted_at}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildScoreThresholdSignals(practical: Record<string, unknown>): ScoreThresholdSignals | null {
  const attempts = collectAttempts(practical);
  if (attempts.length === 0) return null;

  const latest = attempts.slice().sort((a, b) => attemptTime(a) - attemptTime(b)).at(-1);
  if (!latest) return null;
  const score = attemptScore(latest);
  if (score == null) return null;

  const bands: Record<string, ScoreThresholdSide> = {};
  for (const band of SCORE_THRESHOLD_BANDS) {
    bands[String(band)] = score >= band ? "above" : "below";
  }

  return {
    referenceThreshold: PACKAGE_REFERENCE_THRESHOLD,
    latestVsReference: score >= PACKAGE_REFERENCE_THRESHOLD ? "above" : "below",
    bands,
    sittings: attempts.length,
    status: typeof latest.status === "string" ? latest.status : null,
    passed: typeof latest.passed === "boolean"
      ? latest.passed
      : Number.isFinite(score),
  };
}

/** Attach above/below threshold signals before exact marks are stripped. */
export function annotatePracticalThresholdSignals(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => annotatePracticalThresholdSignals(item));
  if (!value || typeof value !== "object") return value;

  const row = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(row)) {
    if (key === "practicalTask") {
      const practical = asRecord(child);
      if (!practical) {
        out[key] = annotatePracticalThresholdSignals(child);
        continue;
      }
      const nested = annotatePracticalThresholdSignals(practical) as Record<string, unknown>;
      const signals = buildScoreThresholdSignals(practical);
      out[key] = signals ? { ...nested, scoreThresholdSignals: signals } : nested;
      continue;
    }
    out[key] = annotatePracticalThresholdSignals(child);
  }
  return out;
}

function walk(value: unknown, prefs: DisclosurePreferences): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, prefs));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (NEVER_DISCLOSE_KEYS.has(key)) continue;
    if (!prefs.shareExactAssessmentMarks && ASSESSMENT_MARK_KEYS.has(key)) continue;
    if (!prefs.shareExactGithubCommitCount && GITHUB_COUNT_KEYS.has(key)) continue;
    // Individual commit rows would let a recruiter count commits exactly.
    if (!prefs.shareExactGithubCommitCount && key === "activities" && Array.isArray(child)) {
      out[key] = child.filter((item) => !isCommitActivity(item)).map((item) => walk(item, prefs));
      continue;
    }
    out[key] = walk(child, prefs);
  }
  return out;
}

export function redactExactValues(
  payload: Record<string, unknown>,
  prefs: DisclosurePreferences,
  asOf: string,
): Record<string, unknown> {
  const { exactValueDisclosure: _ignored, ...rest } = payload;
  const annotated = annotatePracticalThresholdSignals(rest) as Record<string, unknown>;
  const redacted = walk(annotated, prefs) as Record<string, unknown>;
  const meta: ExactValueDisclosureMeta = {
    assessmentMarks: prefs.shareExactAssessmentMarks ? "disclosed" : "withheld",
    githubCommitCount: prefs.shareExactGithubCommitCount ? "disclosed" : "withheld",
    source: "sijil_backend_records",
    asOf,
  };
  redacted.exactValueDisclosure = meta;
  return redacted;
}

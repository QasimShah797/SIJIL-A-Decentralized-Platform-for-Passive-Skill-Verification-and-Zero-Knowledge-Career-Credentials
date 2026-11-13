/**
 * Phase 1 learner longitudinal journey — read-only aggregation of existing history.
 *
 * Does not write source tables, mint tokens, call Fabric, or invent scores.
 * Learner identity must come from verified auth (req.user.id) only.
 */
import { AppError } from "../utils/AppError";
import { getRequestSupabase } from "../config/supabase";
import { EVIDENCE_SOURCE } from "../constants/evidence";
import { LEARNER_MCQ_ATTEMPT_COLUMNS } from "./wallet.service";
import type { JourneyEventType, LearnerJourneyQuery } from "../validators/learner-journey.validator";

export type VerificationClass =
  | "source_reported"
  | "sijil_recorded"
  | "integrity_checked"
  | "skill_assessed";

export type IntegrityStatus =
  | "not_applicable"
  | "unchecked"
  | "hash_matches"
  | "ledger_active"
  | "ledger_revoked"
  | "unavailable";

export type JourneySourceSystem = "mcq" | "github" | "supporting" | "credential" | "sijil";

export interface JourneyEvidenceReference {
  table: string;
  id: string;
  externalId?: string | null;
}

export interface JourneyEventDto {
  eventId: string;
  eventType: JourneyEventType;
  competencyId: string | null;
  competencyName: string | null;
  title: string;
  occurredAt: string | null;
  recordedAt: string;
  sourceSystem: JourneySourceSystem;
  verificationClass: VerificationClass;
  evidenceReference: JourneyEvidenceReference;
  integrityStatus: IntegrityStatus;
  metadata: Record<string, unknown>;
  provenanceKind: "derived_v1" | "materialized_event";
}

export interface SkillGrowthPoint {
  attemptId: string;
  occurredAt: string;
  scorePercent: number;
  passed: boolean;
}

export interface SkillGrowthSeries {
  competencyId: string;
  competencyName: string;
  points: SkillGrowthPoint[];
}

export interface LearnerJourneyResponse {
  schemaVersion: 1;
  generatedAt: string;
  learnerUserId: string;
  disclaimers: {
    absenceOfEvidenceNotAbsenceOfSkill: true;
    sourceReportedIsNotSkillAssessed: true;
  };
  events: JourneyEventDto[];
  skillGrowth: SkillGrowthSeries[];
  page: {
    limit: number;
    nextCursor: string | null;
    truncatedSources: string[];
    incomplete: boolean;
  };
}

type DbRow = Record<string, unknown>;

/** PostgREST/Supabase default max rows per request. */
export const JOURNEY_SOURCE_PAGE_SIZE = 1000;

/**
 * Per-source safety cap to bound memory. Hitting the cap sets incomplete + truncatedSources.
 * Large enough for typical learners; not a silent "complete history" claim.
 */
export const JOURNEY_SOURCE_ROW_CAP = 10_000;

export type JourneySourceFetch =
  | { ok: true; rows: DbRow[]; capped: boolean; incompleteReason?: "row_cap" | "partial_page" }
  | { ok: false; error: string };

export interface LearnerJourneyStore {
  fetchMcqAttempts(learnerUserId: string): Promise<JourneySourceFetch>;
  fetchCredentials(learnerUserId: string): Promise<JourneySourceFetch>;
  fetchSupportingRecords(learnerUserId: string): Promise<JourneySourceFetch>;
  fetchGithubActivities(learnerUserId: string): Promise<JourneySourceFetch>;
  /** GitHub-sourced evidence_records only (legacy Phase-1 path). */
  fetchEvidenceRecords(learnerUserId: string): Promise<JourneySourceFetch>;
  /** LMS/Moodle evidence_records for the authenticated learner. */
  fetchLmsEvidenceRecords(learnerUserId: string): Promise<JourneySourceFetch>;
  /** Learner-owned skill↔evidence links (required before LMS journey mapping). */
  fetchSkillEvidenceLinks(learnerUserId: string): Promise<JourneySourceFetch>;
  fetchDeclaredSkills(learnerUserId: string): Promise<JourneySourceFetch>;
}

interface CursorPayload {
  t: string;
  i: string;
}

interface RankedEvent {
  event: JourneyEventDto;
  /** Epoch ms used for chronological ordering. */
  sortMs: number;
  /** Canonical UTC ISO used in opaque cursors. */
  sortTime: string;
}

const CREDENTIAL_SELECT = [
  "id",
  "name",
  "skill_name",
  "valid_from",
  "created_at",
  "revoked_at",
  "anchor_status",
  "credential_document",
].join(", ");

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: unknown): string | null {
  const text = asText(value);
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isIsoTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeJourneyCursor(raw: string): CursorPayload {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid");
    }
    const row = parsed as Record<string, unknown>;
    const t = asText(row.t);
    const i = asText(row.i);
    if (!isIsoTime(t) || !i) throw new Error("invalid");
    return { t, i };
  } catch {
    throw new AppError("Invalid cursor", 400);
  }
}

/** DESC by sortMs, then ASC by eventId. */
export function compareJourneyRank(a: RankedEvent, b: RankedEvent): number {
  if (a.sortMs !== b.sortMs) return a.sortMs < b.sortMs ? 1 : -1;
  if (a.event.eventId !== b.event.eventId) {
    return a.event.eventId < b.event.eventId ? -1 : 1;
  }
  return 0;
}

function isAfterCursor(event: RankedEvent, cursor: CursorPayload): boolean {
  const cursorMs = Date.parse(cursor.t);
  if (!Number.isFinite(cursorMs)) return true;
  if (event.sortMs !== cursorMs) return event.sortMs < cursorMs;
  return event.event.eventId > cursor.i;
}

type PageResult =
  | { rows: DbRow[] }
  | { error: string };

/**
 * Exhaustive offset pagination with stable id ordering.
 * Stops when a short page is returned, the row cap is hit, or a later page fails (partial).
 */
export async function collectPagedRows(
  fetchPage: (from: number, to: number) => Promise<PageResult>,
  options?: { pageSize?: number; rowCap?: number },
): Promise<JourneySourceFetch> {
  const pageSize = options?.pageSize ?? JOURNEY_SOURCE_PAGE_SIZE;
  const rowCap = options?.rowCap ?? JOURNEY_SOURCE_ROW_CAP;
  if (pageSize < 1 || rowCap < 1) {
    return { ok: false, error: "Invalid pagination configuration" };
  }

  const all: DbRow[] = [];
  let from = 0;

  while (all.length < rowCap) {
    const remaining = rowCap - all.length;
    const take = Math.min(pageSize, remaining);
    const to = from + take - 1;

    let page: PageResult;
    try {
      page = await fetchPage(from, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : "page fetch failed";
      if (all.length === 0) return { ok: false, error: message };
      return { ok: true, rows: all, capped: true, incompleteReason: "partial_page" };
    }

    if ("error" in page) {
      if (all.length === 0) return { ok: false, error: page.error };
      return { ok: true, rows: all, capped: true, incompleteReason: "partial_page" };
    }

    const rows = page.rows;
    if (rows.length === 0) {
      return { ok: true, rows: all, capped: false };
    }

    all.push(...rows);

    if (all.length >= rowCap) {
      return {
        ok: true,
        rows: all.slice(0, rowCap),
        capped: true,
        incompleteReason: "row_cap",
      };
    }

    if (rows.length < take) {
      return { ok: true, rows: all, capped: false };
    }

    from += rows.length;
  }

  return { ok: true, rows: all, capped: true, incompleteReason: "row_cap" };
}

function pagedOwnedTable(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<JourneySourceFetch> {
  return collectPagedRows(async (from, to) => {
    const { data, error } = await buildQuery(from, to);
    if (error) return { error: error.message ?? "query failed" };
    return { rows: Array.isArray(data) ? data as DbRow[] : [] };
  });
}

export function createSupabaseLearnerJourneyStore(): LearnerJourneyStore {
  const db = () => getRequestSupabase();
  return {
    fetchMcqAttempts(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("mcq_task_attempts")
          .select(LEARNER_MCQ_ATTEMPT_COLUMNS.join(", "))
          .eq("learner_user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchCredentials(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("credentials")
          .select(CREDENTIAL_SELECT)
          .eq("user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchSupportingRecords(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("supporting_records")
          .select("id, skill_id, source, title, url, occurred_at, created_at, content_hash")
          .eq("user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchGithubActivities(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("github_activities")
          .select(
            "id, linked_skill_id, activity_type, activity_title, activity_url, repo_name, occurred_at, synced_at, external_id",
          )
          .eq("user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchEvidenceRecords(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("evidence_records")
          .select(
            "id, mapped_skill_id, suggested_skill_id, source, repository_name, repository_url, language, commit_count, sync_date, status, external_id, last_updated, created_at",
          )
          .eq("user_id", learnerUserId)
          .eq("source", EVIDENCE_SOURCE.GITHUB)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchLmsEvidenceRecords(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("evidence_records")
          .select(
            "id, user_id, mapped_skill_id, suggested_skill_id, suggested_skill_name, source, repository_name, repository_url, description, status, external_id, metadata, sync_date, last_updated, created_at",
          )
          .eq("user_id", learnerUserId)
          .eq("source", EVIDENCE_SOURCE.LMS)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchSkillEvidenceLinks(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("skill_evidence_links")
          .select("id, user_id, skill_id, evidence_record_id, linked_at")
          .eq("user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    fetchDeclaredSkills(learnerUserId) {
      return pagedOwnedTable((from, to) =>
        db()
          .from("declared_skills")
          .select("id, name")
          .eq("user_id", learnerUserId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
  };
}

function truncatedSourceLabel(
  name: string,
  result: JourneySourceFetch,
): string | null {
  if (!result.ok) return name;
  if (!result.capped) return null;
  if (result.incompleteReason === "partial_page") return `${name}:partial_page`;
  return `${name}:row_cap`;
}

function skillMaps(skillRows: DbRow[]): {
  byId: Map<string, string>;
  byName: Map<string, string>;
} {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of skillRows) {
    const id = asText(row.id);
    const name = asText(row.name);
    if (!id || !name) continue;
    byId.set(id, name);
    byName.set(name.toLowerCase(), id);
  }
  return { byId, byName };
}

function resolveCompetency(
  skillId: string | null,
  skillName: string | null,
  maps: ReturnType<typeof skillMaps>,
): { competencyId: string | null; competencyName: string | null } {
  if (skillId && maps.byId.has(skillId)) {
    return { competencyId: skillId, competencyName: maps.byId.get(skillId) ?? skillName };
  }
  if (skillName) {
    const id = maps.byName.get(skillName.toLowerCase()) ?? null;
    return { competencyId: id, competencyName: skillName };
  }
  return { competencyId: skillId, competencyName: skillName };
}

function documentHasAssessmentCommitment(document: unknown): boolean {
  if (!document || typeof document !== "object") return false;
  const subject = (document as Record<string, unknown>).credentialSubject;
  if (!subject || typeof subject !== "object") return false;
  const claim = (subject as Record<string, unknown>).assessmentCommitment;
  if (!claim || typeof claim !== "object") return false;
  const commitment = asText((claim as Record<string, unknown>).commitment);
  return commitment.length > 0;
}

function rank(event: JourneyEventDto): RankedEvent | null {
  const raw = event.occurredAt && isIsoTime(event.occurredAt)
    ? event.occurredAt
    : event.recordedAt;
  if (!isIsoTime(raw)) return null;
  const sortMs = Date.parse(raw);
  if (!Number.isFinite(sortMs)) return null;
  return {
    event,
    sortMs,
    sortTime: new Date(sortMs).toISOString(),
  };
}

type GrowthAccumulator = SkillGrowthPoint & { competencyId: string; competencyName: string };

export function mapMcqEvents(
  rows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
): { events: JourneyEventDto[]; growth: GrowthAccumulator[] } {
  const events: JourneyEventDto[] = [];
  const growth: GrowthAccumulator[] = [];

  for (const row of rows) {
    const id = asText(row.id);
    if (!id) continue;
    const status = asText(row.status).toLowerCase();
    if (status === "in_progress") continue;
    if (status !== "completed") continue;

    const submittedAt = asNullableText(row.submitted_at);
    const createdAt = asNullableText(row.created_at);
    const recordedAt = submittedAt ?? createdAt;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;

    const skillId = asNullableText(row.skill_id);
    const skillName = asNullableText(row.competency_name);
    const { competencyId, competencyName } = resolveCompetency(skillId, skillName, maps);
    const scorePercent = asNumber(row.percentage);
    const passed = row.passed === true || (scorePercent != null && scorePercent >= 60);
    const title = asText(row.title) || "Practical assessment";

    events.push({
      eventId: `mcq:${id}`,
      eventType: "assessment_completed",
      competencyId,
      competencyName,
      title,
      occurredAt: submittedAt,
      recordedAt,
      sourceSystem: "mcq",
      verificationClass: "skill_assessed",
      evidenceReference: { table: "mcq_task_attempts", id },
      integrityStatus: "not_applicable",
      metadata: {
        scorePercent,
        passed,
        correctCount: asNumber(row.correct_count),
        totalQuestions: asNumber(row.total_questions),
        ...(submittedAt ? {} : { timestampPrecision: "created_at_fallback" }),
      },
      provenanceKind: "derived_v1",
    });

    if (
      scorePercent != null
      && submittedAt
      && isIsoTime(submittedAt)
      && competencyId
    ) {
      growth.push({
        attemptId: id,
        occurredAt: submittedAt,
        scorePercent,
        passed,
        competencyId,
        competencyName: competencyName ?? "Competency",
      });
    }
  }

  return { events, growth };
}

export function mapCredentialEvents(
  rows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
): JourneyEventDto[] {
  const events: JourneyEventDto[] = [];

  for (const row of rows) {
    const id = asText(row.id);
    if (!id) continue;
    const skillName = asNullableText(row.skill_name);
    const { competencyId, competencyName } = resolveCompetency(null, skillName, maps);
    const validFrom = asNullableText(row.valid_from);
    const createdAt = asNullableText(row.created_at);
    const recordedAt = validFrom ?? createdAt;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;

    const assessed = documentHasAssessmentCommitment(row.credential_document);
    const title = asText(row.name) || "Credential issued";
    const dbAnchor = asNullableText(row.anchor_status);

    events.push({
      eventId: `cred:${id}:issued`,
      eventType: "credential_issued",
      competencyId,
      competencyName,
      title,
      occurredAt: validFrom,
      recordedAt,
      sourceSystem: "credential",
      verificationClass: assessed ? "skill_assessed" : "sijil_recorded",
      evidenceReference: { table: "credentials", id },
      // DB anchor_status is not a live ledger verification.
      integrityStatus: "unchecked",
      metadata: {
        skillName,
        dbAnchorStatus: dbAnchor,
        hasAssessmentCommitment: assessed,
        revoked: Boolean(asNullableText(row.revoked_at)),
      },
      provenanceKind: "derived_v1",
    });

    const revokedAt = asNullableText(row.revoked_at);
    if (revokedAt && isIsoTime(revokedAt)) {
      events.push({
        eventId: `cred:${id}:revoked`,
        eventType: "credential_revoked",
        competencyId,
        competencyName,
        title: `${title} revoked`,
        occurredAt: revokedAt,
        recordedAt: revokedAt,
        sourceSystem: "credential",
        verificationClass: "sijil_recorded",
        evidenceReference: { table: "credentials", id },
        integrityStatus: "unchecked",
        metadata: {
          skillName,
          dbAnchorStatus: dbAnchor,
        },
        provenanceKind: "derived_v1",
      });
    }
  }

  return events;
}

export function mapSupportingEvents(
  rows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
): JourneyEventDto[] {
  const events: JourneyEventDto[] = [];
  for (const row of rows) {
    const id = asText(row.id);
    if (!id) continue;
    const createdAt = asNullableText(row.created_at);
    const occurredAt = asNullableText(row.occurred_at);
    const recordedAt = createdAt ?? occurredAt;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;
    const skillId = asNullableText(row.skill_id);
    const { competencyId, competencyName } = resolveCompetency(skillId, null, maps);
    const title = asText(row.title) || "Supporting evidence";
    const contentHash = asNullableText(row.content_hash);

    events.push({
      eventId: `sup:${id}`,
      eventType: "supporting_evidence_added",
      competencyId,
      competencyName,
      title,
      occurredAt,
      recordedAt,
      sourceSystem: "supporting",
      verificationClass: "sijil_recorded",
      evidenceReference: { table: "supporting_records", id },
      integrityStatus: "not_applicable",
      metadata: {
        source: asNullableText(row.source),
        url: asNullableText(row.url),
        hasContentHash: Boolean(contentHash),
      },
      provenanceKind: "derived_v1",
    });
  }
  return events;
}

/**
 * Display-only repair for stored GitHub activity titles that interpolated
 * missing PR/issue subjects as the literals "undefined" / "null".
 * Does not write back to github_activities. Narrow: only exact placeholder
 * subjects after the colon — legitimate titles containing those words are kept.
 */
export function sanitizeGithubActivityTitleForDisplay(
  activityTitle: string,
  activityType?: string | null,
): string {
  const trimmed = activityTitle.trim();
  if (!trimmed) return "GitHub activity";

  const isPlaceholder = (subject: string) => {
    const s = subject.trim().toLowerCase();
    return s === "undefined" || s === "null" || s === "";
  };

  const prEvent = trimmed.match(/^(PR #\d+\s+\S+):\s*(.*)$/i);
  if (prEvent) {
    const prefix = prEvent[1];
    const subject = prEvent[2] ?? "";
    if (isPlaceholder(subject)) return `${prefix}: Untitled pull request`;
    return trimmed;
  }

  const prSearch = trimmed.match(/^(PR #\d+):\s*(.*?)\s*(\([^)]*\))$/i);
  if (prSearch) {
    const prefix = prSearch[1];
    const subject = prSearch[2] ?? "";
    const state = prSearch[3];
    if (isPlaceholder(subject)) return `${prefix}: Untitled pull request ${state}`;
    return trimmed;
  }

  const prSearchNoState = trimmed.match(/^(PR #\d+):\s*(.*)$/i);
  if (prSearchNoState) {
    const prefix = prSearchNoState[1];
    const subject = prSearchNoState[2] ?? "";
    if (isPlaceholder(subject)) return `${prefix}: Untitled pull request`;
    return trimmed;
  }

  const issueEvent = trimmed.match(/^(Issue #\d+\s+\S+):\s*(.*)$/i);
  if (issueEvent) {
    const prefix = issueEvent[1];
    const subject = issueEvent[2] ?? "";
    if (isPlaceholder(subject)) return `${prefix}: Untitled issue`;
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "undefined" || lower === "null") {
    if (activityType === "pull_request") return "Untitled pull request";
    if (activityType === "issue") return "Untitled issue";
    return "GitHub activity";
  }

  return trimmed;
}

export function mapGithubActivityEvents(
  rows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
): JourneyEventDto[] {
  const events: JourneyEventDto[] = [];
  for (const row of rows) {
    const id = asText(row.id);
    if (!id) continue;
    const occurredAt = asNullableText(row.occurred_at);
    const syncedAt = asNullableText(row.synced_at);
    const recordedAt = syncedAt ?? occurredAt;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;
    const linked = asNullableText(row.linked_skill_id);
    const { competencyId, competencyName } = resolveCompetency(linked, null, maps);
    const activityType = asNullableText(row.activity_type);
    const rawTitle = asText(row.activity_title);
    const title = sanitizeGithubActivityTitleForDisplay(
      rawTitle || "GitHub activity",
      activityType,
    );

    events.push({
      eventId: `ghact:${id}`,
      eventType: "github_activity_observed",
      competencyId,
      competencyName,
      title,
      occurredAt,
      recordedAt,
      sourceSystem: "github",
      verificationClass: "source_reported",
      evidenceReference: {
        table: "github_activities",
        id,
        externalId: asNullableText(row.external_id),
      },
      integrityStatus: "unchecked",
      metadata: {
        activityType,
        repoName: asNullableText(row.repo_name),
        activityUrl: asNullableText(row.activity_url),
      },
      provenanceKind: "derived_v1",
    });
  }
  return events;
}

/**
 * When skill_evidence_links is unavailable (e.g. hosted table missing), build
 * synthetic links only from LMS rows whose mapped_skill_id is one of the
 * learner's declared skills. Never invent cross-learner associations.
 */
export function synthesizeLmsLinksFromMappedSkills(
  evidenceRows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
  learnerUserId: string,
): DbRow[] {
  const links: DbRow[] = [];
  for (const row of evidenceRows) {
    const id = asText(row.id);
    if (!id) continue;
    const owner = asNullableText(row.user_id);
    if (owner && owner !== learnerUserId) continue;
    if (asText(row.source) !== EVIDENCE_SOURCE.LMS) continue;
    const mapped = asNullableText(row.mapped_skill_id);
    if (!mapped || !maps.byId.has(mapped)) continue;
    links.push({
      id: `synthetic:${id}`,
      user_id: learnerUserId,
      skill_id: mapped,
      evidence_record_id: id,
      linked_at: asNullableText(row.sync_date) ?? asNullableText(row.created_at),
      _synthetic_from: "mapped_skill_id",
    });
  }
  return links;
}

/**
 * Derive supporting_evidence_added events from LMS/Moodle evidence_records.
 * Only includes rows with a learner-owned skill_evidence_links association
 * (or synthetic mapped_skill links when the links table fetch failed).
 * verificationClass is always source_reported — not SIJIL skill assessment.
 */
export function mapLmsEvidenceEvents(
  evidenceRows: DbRow[],
  linkRows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
  learnerUserId: string,
): JourneyEventDto[] {
  const linkedSkillByEvidence = new Map<string, string>();
  for (const link of linkRows) {
    const linkUser = asNullableText(link.user_id);
    if (linkUser && linkUser !== learnerUserId) continue;
    const evidenceId = asText(link.evidence_record_id);
    const skillId = asText(link.skill_id);
    if (!evidenceId || !skillId) continue;
    if (!linkedSkillByEvidence.has(evidenceId)) {
      linkedSkillByEvidence.set(evidenceId, skillId);
    }
  }

  const events: JourneyEventDto[] = [];
  const seenEventIds = new Set<string>();

  for (const row of evidenceRows) {
    const id = asText(row.id);
    if (!id) continue;

    const owner = asNullableText(row.user_id);
    if (owner && owner !== learnerUserId) continue;

    if (asText(row.source) !== EVIDENCE_SOURCE.LMS) continue;

    const linkedSkillId = linkedSkillByEvidence.get(id);
    if (!linkedSkillId) continue;

    const lastUpdated = asNullableText(row.last_updated);
    const syncDate = asNullableText(row.sync_date);
    const createdAt = asNullableText(row.created_at);
    const recordedAt = syncDate ?? createdAt ?? lastUpdated;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;

    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    const assignmentName =
      asText(meta.assignment_name)
      || asText(row.repository_name)
      || asText(row.description)
      || "Moodle assignment";
    const courseName = asNullableText(meta.course_name);
    const grade = asNumber(meta.grade);
    const gradeMax = asNumber(meta.grade_max);
    const gradePercentage = asNumber(meta.grade_percentage);
    const moodleCourseId = asNumber(meta.moodle_course_id);
    const moodleAssignmentId = asNumber(meta.moodle_assignment_id);
    const platform = asNullableText(meta.platform) ?? "Moodle";
    const moodleSiteUrl = asNullableText(row.repository_url);
    const suggestedName = asNullableText(row.suggested_skill_name);
    const { competencyId, competencyName } = resolveCompetency(
      linkedSkillId,
      suggestedName,
      maps,
    );

    const externalId = asNullableText(row.external_id);
    const eventId = externalId ? `lms:${externalId}` : `lms:${id}`;
    if (seenEventIds.has(eventId)) continue;
    seenEventIds.add(eventId);

    const occurredAt = lastUpdated ?? syncDate ?? null;

    events.push({
      eventId,
      eventType: "supporting_evidence_added",
      competencyId,
      competencyName,
      title: assignmentName,
      occurredAt: occurredAt && isIsoTime(occurredAt) ? occurredAt : null,
      recordedAt,
      sourceSystem: "supporting",
      verificationClass: "source_reported",
      evidenceReference: {
        table: "evidence_records",
        id,
        externalId,
      },
      integrityStatus: "unchecked",
      metadata: {
        platform,
        courseName,
        assignmentName,
        grade,
        gradeMax,
        gradePercentage,
        moodleCourseId,
        moodleAssignmentId,
        moodleSiteUrl,
        sourceReportedIsNotSkillAssessed: true,
      },
      provenanceKind: "derived_v1",
    });
  }

  return events;
}

export function mapGithubEvidenceEvents(
  rows: DbRow[],
  maps: ReturnType<typeof skillMaps>,
): JourneyEventDto[] {
  const events: JourneyEventDto[] = [];
  for (const row of rows) {
    const id = asText(row.id);
    if (!id) continue;
    if (asText(row.source) && asText(row.source) !== EVIDENCE_SOURCE.GITHUB) continue;
    const lastUpdated = asNullableText(row.last_updated);
    const syncDate = asNullableText(row.sync_date);
    const createdAt = asNullableText(row.created_at);
    const recordedAt = syncDate ?? createdAt ?? lastUpdated;
    if (!recordedAt || !isIsoTime(recordedAt)) continue;
    const skillId = asNullableText(row.mapped_skill_id) ?? asNullableText(row.suggested_skill_id);
    const { competencyId, competencyName } = resolveCompetency(skillId, null, maps);
    const repo = asText(row.repository_name) || "GitHub project";

    events.push({
      eventId: `ghev:${id}`,
      eventType: "github_project_evidence_synced",
      competencyId,
      competencyName,
      title: repo,
      occurredAt: lastUpdated,
      recordedAt,
      sourceSystem: "github",
      verificationClass: "source_reported",
      evidenceReference: {
        table: "evidence_records",
        id,
        externalId: asNullableText(row.external_id),
      },
      integrityStatus: "unchecked",
      metadata: {
        repositoryUrl: asNullableText(row.repository_url),
        language: asNullableText(row.language),
        commitCount: asNumber(row.commit_count),
        status: asNullableText(row.status),
        snapshotOnly: true,
      },
      provenanceKind: "derived_v1",
    });
  }
  return events;
}

function buildSkillGrowth(
  points: Array<SkillGrowthPoint & { competencyId: string; competencyName: string }>,
): SkillGrowthSeries[] {
  const bySkill = new Map<string, SkillGrowthSeries>();
  const sorted = [...points].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
    return a.attemptId < b.attemptId ? -1 : 1;
  });
  for (const point of sorted) {
    const series = bySkill.get(point.competencyId) ?? {
      competencyId: point.competencyId,
      competencyName: point.competencyName,
      points: [],
    };
    series.points.push({
      attemptId: point.attemptId,
      occurredAt: point.occurredAt,
      scorePercent: point.scorePercent,
      passed: point.passed,
    });
    bySkill.set(point.competencyId, series);
  }
  return [...bySkill.values()].sort((a, b) => a.competencyName.localeCompare(b.competencyName));
}

function stripSensitive(value: unknown): unknown {
  // Defense in depth for accidental nesting — never ship known secret keys.
  const banned = new Set([
    "answer_key",
    "learner_answers",
    "questions",
    "blinding",
    "proof",
    "proofValue",
    "credential_document",
    "credentialDocument",
    "content_hash",
    "disclosure_token",
    "disclosureToken",
    "opening",
  ]);
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (banned.has(key)) continue;
    out[key] = stripSensitive(nested);
  }
  return out;
}

export async function getLearnerJourney(
  learnerUserId: string,
  query: LearnerJourneyQuery,
  store: LearnerJourneyStore = createSupabaseLearnerJourneyStore(),
  now: () => Date = () => new Date(),
): Promise<LearnerJourneyResponse> {
  if (!learnerUserId || !/^[0-9a-f-]{36}$/i.test(learnerUserId)) {
    throw new AppError("Invalid learner identity", 400);
  }

  const cursor = query.cursor ? decodeJourneyCursor(query.cursor) : null;

  const [
    mcq,
    credentials,
    supporting,
    activities,
    evidence,
    lmsEvidence,
    skillLinks,
    skills,
  ] = await Promise.all([
    store.fetchMcqAttempts(learnerUserId),
    store.fetchCredentials(learnerUserId),
    store.fetchSupportingRecords(learnerUserId),
    store.fetchGithubActivities(learnerUserId),
    store.fetchEvidenceRecords(learnerUserId),
    store.fetchLmsEvidenceRecords(learnerUserId),
    store.fetchSkillEvidenceLinks(learnerUserId),
    store.fetchDeclaredSkills(learnerUserId),
  ]);

  const fetches: Array<{ name: string; result: JourneySourceFetch }> = [
    { name: "mcq_task_attempts", result: mcq },
    { name: "credentials", result: credentials },
    { name: "supporting_records", result: supporting },
    { name: "github_activities", result: activities },
    { name: "evidence_records", result: evidence },
    { name: "lms_evidence_records", result: lmsEvidence },
    { name: "skill_evidence_links", result: skillLinks },
    { name: "declared_skills", result: skills },
  ];

  const truncatedSources = fetches
    .map((f) => truncatedSourceLabel(f.name, f.result))
    .filter((label): label is string => label != null);
  const anyOk = fetches.some((f) => f.result.ok);
  if (!anyOk) {
    throw new AppError("Learner journey data sources are temporarily unavailable", 503);
  }

  const maps = skillMaps(skills.ok ? skills.rows : []);
  const allEvents: JourneyEventDto[] = [];
  let growthPoints: Array<SkillGrowthPoint & { competencyId: string; competencyName: string }> = [];

  if (mcq.ok) {
    const mapped = mapMcqEvents(mcq.rows, maps);
    allEvents.push(...mapped.events);
    growthPoints = mapped.growth;
  }
  if (credentials.ok) allEvents.push(...mapCredentialEvents(credentials.rows, maps));
  if (supporting.ok) allEvents.push(...mapSupportingEvents(supporting.rows, maps));
  if (activities.ok) allEvents.push(...mapGithubActivityEvents(activities.rows, maps));
  if (evidence.ok) allEvents.push(...mapGithubEvidenceEvents(evidence.rows, maps));
  if (lmsEvidence.ok) {
    if (skillLinks.ok) {
      allEvents.push(
        ...mapLmsEvidenceEvents(lmsEvidence.rows, skillLinks.rows, maps, learnerUserId),
      );
    } else {
      // Hosted may lack skill_evidence_links — fall back to learner-owned mapped_skill_id only.
      // truncatedSources already lists skill_evidence_links (ok:false) → incomplete stays honest.
      const syntheticLinks = synthesizeLmsLinksFromMappedSkills(
        lmsEvidence.rows,
        maps,
        learnerUserId,
      );
      allEvents.push(
        ...mapLmsEvidenceEvents(lmsEvidence.rows, syntheticLinks, maps, learnerUserId),
      );
    }
  }

  const deduped = new Map<string, JourneyEventDto>();
  for (const event of allEvents) {
    deduped.set(event.eventId, event);
  }

  let ranked = [...deduped.values()]
    .map(rank)
    .filter((row): row is RankedEvent => row != null);

  if (query.competencyId) {
    ranked = ranked.filter((row) => row.event.competencyId === query.competencyId);
  }
  if (query.eventTypes && query.eventTypes.length > 0) {
    const allowed = new Set(query.eventTypes);
    ranked = ranked.filter((row) => allowed.has(row.event.eventType));
  }

  ranked.sort(compareJourneyRank);

  if (cursor) {
    ranked = ranked.filter((row) => isAfterCursor(row, cursor));
  }

  const pageRows = ranked.slice(0, query.limit);
  const next = ranked.length > query.limit ? pageRows[pageRows.length - 1] : null;

  let skillGrowth = buildSkillGrowth(growthPoints);
  if (query.competencyId) {
    skillGrowth = skillGrowth.filter((series) => series.competencyId === query.competencyId);
  }

  const response: LearnerJourneyResponse = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    learnerUserId,
    disclaimers: {
      absenceOfEvidenceNotAbsenceOfSkill: true,
      sourceReportedIsNotSkillAssessed: true,
    },
    events: pageRows.map((row) => stripSensitive(row.event) as JourneyEventDto),
    skillGrowth,
    page: {
      limit: query.limit,
      nextCursor: next
        ? encodeCursor({ t: next.sortTime, i: next.event.eventId })
        : null,
      truncatedSources,
      incomplete: truncatedSources.length > 0,
    },
  };

  return response;
}

/** Mutable facade so route tests can stub without live DB (same pattern as peerReviewService). */
export const learnerJourneyService = {
  getJourney: getLearnerJourney,
};

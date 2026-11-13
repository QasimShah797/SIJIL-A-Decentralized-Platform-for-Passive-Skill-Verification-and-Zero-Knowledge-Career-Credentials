/**
 * Learner longitudinal journey API client (Phase 1).
 * Never sends a client-selected learner id — auth is Bearer-only.
 */
import { apiRequest, isApiEnabled } from "./client";

export const JOURNEY_EVENT_TYPES = [
  "assessment_completed",
  "supporting_evidence_added",
  "github_activity_observed",
  "github_project_evidence_synced",
  "credential_issued",
  "credential_revoked",
] as const;

export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number];

export type JourneyVerificationClass =
  | "source_reported"
  | "sijil_recorded"
  | "integrity_checked"
  | "skill_assessed";

export type JourneyIntegrityStatus =
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
  verificationClass: JourneyVerificationClass;
  evidenceReference: JourneyEvidenceReference;
  integrityStatus: JourneyIntegrityStatus;
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

export interface FetchLearnerJourneyParams {
  limit?: number;
  cursor?: string | null;
  competencyId?: string | null;
  eventTypes?: JourneyEventType[] | null;
}

export function buildLearnerJourneyPath(params: FetchLearnerJourneyParams = {}): string {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.competencyId) search.set("competencyId", params.competencyId);
  if (params.eventTypes && params.eventTypes.length > 0) {
    search.set("eventTypes", params.eventTypes.join(","));
  }
  const qs = search.toString();
  return qs ? `/learner/journey?${qs}` : "/learner/journey";
}

export async function fetchLearnerJourney(
  params: FetchLearnerJourneyParams = {},
): Promise<LearnerJourneyResponse> {
  if (!isApiEnabled()) {
    throw new Error("Backend API is not configured (VITE_API_BASE_URL).");
  }
  return apiRequest<LearnerJourneyResponse>(buildLearnerJourneyPath(params));
}

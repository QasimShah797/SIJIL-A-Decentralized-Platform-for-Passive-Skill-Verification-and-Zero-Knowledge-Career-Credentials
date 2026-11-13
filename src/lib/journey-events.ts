/**
 * Client-side helpers for merging / ordering journey timeline events.
 */
import type { JourneyEventDto } from "@/services/api/journey.api";

function sortTimeMs(event: JourneyEventDto): number {
  const iso = event.occurredAt ?? event.recordedAt;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** Newest-first, then stable eventId ascending — mirrors backend journey ranking. */
export function compareJourneyEventsDesc(a: JourneyEventDto, b: JourneyEventDto): number {
  const aMs = sortTimeMs(a);
  const bMs = sortTimeMs(b);
  if (aMs !== bMs) return aMs < bMs ? 1 : -1;
  if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
  return 0;
}

/**
 * Replace or append pages while deduplicating by stable eventId.
 * Keeps the first-seen copy of an id (earlier page wins on overlap).
 */
export function mergeJourneyEvents(
  existing: JourneyEventDto[],
  incoming: JourneyEventDto[],
  mode: "replace" | "append",
): JourneyEventDto[] {
  if (mode === "replace") {
    const seen = new Map<string, JourneyEventDto>();
    for (const event of incoming) {
      if (!seen.has(event.eventId)) seen.set(event.eventId, event);
    }
    return [...seen.values()].sort(compareJourneyEventsDesc);
  }

  const seen = new Map<string, JourneyEventDto>();
  for (const event of existing) {
    seen.set(event.eventId, event);
  }
  for (const event of incoming) {
    if (!seen.has(event.eventId)) seen.set(event.eventId, event);
  }
  return [...seen.values()].sort(compareJourneyEventsDesc);
}

export function isSnapshotOnlyMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.snapshotOnly === true;
}

/** Moodle/LMS source-reported journey events (not SIJIL skill assessment). */
export function isMoodleJourneyMetadata(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  return String(metadata.platform ?? "").trim().toLowerCase() === "moodle";
}

/**
 * Format LMS grade for journey UI. Returns null when grade is absent — never invents scores.
 */
export function formatJourneyLmsGrade(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const grade = metadata.grade;
  const gradeMax = metadata.gradeMax ?? metadata.grade_max;
  const gradeOk = typeof grade === "number" && Number.isFinite(grade);
  const maxOk = typeof gradeMax === "number" && Number.isFinite(gradeMax);
  if (gradeOk && maxOk) return `${grade}/${gradeMax}`;
  if (gradeOk) return String(grade);
  return null;
}

/** Assessment score chart is meaningful only when assessments are in scope. */
export function shouldShowAssessmentGrowthChart(eventTypeFilter: string): boolean {
  return eventTypeFilter === "all" || eventTypeFilter === "assessment_completed";
}

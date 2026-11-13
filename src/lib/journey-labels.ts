/**
 * User-facing labels for journey verification / integrity / event types.
 * Keeps copy accurate: no false "blockchain verified" from unchecked / hash status.
 */
import type {
  JourneyEventType,
  JourneyIntegrityStatus,
  JourneySourceSystem,
  JourneyVerificationClass,
} from "@/services/api/journey.api";

export function verificationClassLabel(value: JourneyVerificationClass): string {
  switch (value) {
    case "source_reported":
      return "Source-reported";
    case "sijil_recorded":
      return "SIJIL-recorded";
    case "skill_assessed":
      return "SIJIL-assessed";
    case "integrity_checked":
      return "Integrity-checked";
    default:
      return "Recorded";
  }
}

export function integrityStatusLabel(value: JourneyIntegrityStatus): string | null {
  switch (value) {
    case "not_applicable":
      return null;
    case "unchecked":
      return "Integrity not checked";
    case "hash_matches":
      // Local/stored hash agreement only — not a live ledger proof.
      return "Hash matches stored record";
    case "ledger_active":
      return "Ledger result: active";
    case "ledger_revoked":
      return "Ledger result: revoked";
    case "unavailable":
      return "Integrity check unavailable";
    default:
      return null;
  }
}

/**
 * True only for statuses that represent an actual ledger verification outcome.
 * hash_matches is NOT live blockchain verification.
 * unchecked / not_applicable / unavailable never qualify.
 * DB anchor_status alone never maps here on the Phase 1 journey API.
 */
export function claimsLiveBlockchainVerification(value: JourneyIntegrityStatus): boolean {
  return value === "ledger_active" || value === "ledger_revoked";
}

export function eventTypeLabel(value: JourneyEventType): string {
  switch (value) {
    case "assessment_completed":
      return "Assessment completed";
    case "supporting_evidence_added":
      return "Supporting evidence added";
    case "github_activity_observed":
      return "GitHub activity observed";
    case "github_project_evidence_synced":
      return "GitHub project evidence synced";
    case "credential_issued":
      return "Credential issued";
    case "credential_revoked":
      return "Credential revoked";
    default:
      return "Journey event";
  }
}

export function sourceSystemLabel(value: JourneySourceSystem): string {
  switch (value) {
    case "mcq":
      return "SIJIL assessment";
    case "github":
      return "GitHub";
    case "supporting":
      return "Supporting record";
    case "credential":
      return "Credential";
    case "sijil":
      return "SIJIL";
    default:
      return "Source";
  }
}

export function formatJourneyDate(iso: string | null | undefined): string {
  if (!iso) return "Date unknown";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Date unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

export function humanizeTruncatedSource(raw: string): string {
  const [table, reason] = raw.split(":");
  const name = table.replace(/_/g, " ");
  if (reason === "row_cap") return `${name} (safety limit reached)`;
  if (reason === "partial_page") return `${name} (partial load)`;
  return name;
}

export const GITHUB_SNAPSHOT_LABEL = "Current snapshot — not historical version";

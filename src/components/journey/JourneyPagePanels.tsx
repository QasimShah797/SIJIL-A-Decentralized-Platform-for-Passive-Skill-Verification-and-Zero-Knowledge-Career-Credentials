import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatJourneyLmsGrade,
  isMoodleJourneyMetadata,
  isSnapshotOnlyMetadata,
  shouldShowAssessmentGrowthChart,
} from "@/lib/journey-events";
import {
  GITHUB_SNAPSHOT_LABEL,
  eventTypeLabel,
  formatJourneyDate,
  humanizeTruncatedSource,
  integrityStatusLabel,
  sourceSystemLabel,
  verificationClassLabel,
} from "@/lib/journey-labels";
import {
  JOURNEY_EVENT_TYPES,
  type JourneyEventDto,
  type JourneyEventType,
  type SkillGrowthSeries,
} from "@/services/api/journey.api";

export function JourneyHeader() {
  return (
    <header className="mb-6 space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-[#023E8A] dark:text-sky-100">
        My Skill Journey
      </h1>
      <p className="max-w-3xl text-sm text-[#475569] dark:text-slate-300">
        A chronological view of learning evidence SIJIL has recorded for you — assessments,
        projects, and credentials — as it evolved over time.
      </p>
      <p className="max-w-3xl text-xs text-[#64748b] dark:text-slate-400">
        Source-reported GitHub, Moodle, or supporting evidence is not the same as a SIJIL-assessed skill.
        Missing records do not mean you lack a skill.
      </p>
    </header>
  );
}

export function JourneyCompletenessWarning({
  incomplete,
  truncatedSources,
}: {
  incomplete: boolean;
  truncatedSources: string[];
}) {
  if (!incomplete) return null;
  const details = truncatedSources.map(humanizeTruncatedSource);
  return (
    <div
      role="status"
      className="mb-4 flex gap-3 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Some historical records may be missing</p>
        <p className="mt-1 text-xs opacity-90">
          This view is incomplete. Totals below only reflect loaded events, not your full history.
        </p>
        {details.length > 0 ? (
          <p className="mt-2 text-xs opacity-80">Affected sources: {details.join(", ")}</p>
        ) : null}
      </div>
    </div>
  );
}

export function JourneyOverviewCards({
  loadedEventCount,
  assessmentCount,
  credentialMilestoneCount,
  hasMore,
  incomplete,
}: {
  loadedEventCount: number;
  assessmentCount: number;
  credentialMilestoneCount: number;
  hasMore: boolean;
  incomplete: boolean;
}) {
  const scopeNote = incomplete || hasMore ? "Loaded so far" : "In this journey";
  const cards = [
    { label: "Events", value: loadedEventCount },
    { label: "Assessments", value: assessmentCount },
    { label: "Credential milestones", value: credentialMilestoneCount },
  ];
  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Journey overview">
      {cards.map((card) => (
        <div key={card.label} className="learner-stat-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{scopeNote}</p>
          <p className="mt-1 text-2xl font-semibold text-[#023E8A] dark:text-sky-100">{card.value}</p>
          <p className="text-sm text-[#334155] dark:text-slate-300">{card.label}</p>
        </div>
      ))}
    </section>
  );
}

export function JourneyFilters({
  competencies,
  competencyId,
  eventType,
  onCompetencyChange,
  onEventTypeChange,
  disabled,
}: {
  competencies: Array<{ id: string; name: string }>;
  competencyId: string;
  eventType: string;
  onCompetencyChange: (value: string) => void;
  onEventTypeChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="mb-6 flex flex-wrap gap-3" aria-label="Journey filters">
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#64748b]" htmlFor="journey-competency">
          Competency
        </label>
        <select
          id="journey-competency"
          className={selectClassName}
          value={competencyId}
          disabled={disabled}
          onChange={(e) => onCompetencyChange(e.target.value)}
        >
          <option value="all">All competencies</option>
          {competencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#64748b]" htmlFor="journey-event-type">
          Event type
        </label>
        <select
          id="journey-event-type"
          className={selectClassName}
          value={eventType}
          disabled={disabled}
          onChange={(e) => onEventTypeChange(e.target.value)}
        >
          <option value="all">All events</option>
          {JOURNEY_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {eventTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

export function JourneyGrowthChart({
  series,
  selectedCompetencyId,
  eventTypeFilter,
}: {
  series: SkillGrowthSeries[];
  selectedCompetencyId: string;
  eventTypeFilter: string;
}) {
  const assessmentsInScope = shouldShowAssessmentGrowthChart(eventTypeFilter);

  const visible = selectedCompetencyId === "all"
    ? series
    : series.filter((s) => s.competencyId === selectedCompetencyId);

  const chartRows = assessmentsInScope
    ? visible.flatMap((s) =>
      s.points.map((point) => ({
        key: `${s.competencyId}:${point.attemptId}`,
        competency: s.competencyName,
        scorePercent: point.scorePercent,
        dateLabel: formatJourneyDate(point.occurredAt),
        occurredAt: point.occurredAt,
      })),
    ).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    : [];

  return (
    <section className="learner-stat-card mb-6 p-4" aria-label="Skill growth chart">
      <h2 className="text-sm font-semibold text-[#023E8A] dark:text-sky-100">Assessment score history</h2>
      <p className="mt-1 text-xs text-[#64748b]">
        Only real SIJIL assessment percentages. No invented or interpolated scores.
        {assessmentsInScope
          ? " Shown when All events or Assessment completed is selected."
          : ""}
      </p>
      {!assessmentsInScope ? (
        <p className="mt-6 text-sm text-[#94a3b8]" role="status">
          Assessment score history is hidden while the timeline is filtered to a non-assessment
          event type. Choose All events or Assessment completed to view scores.
        </p>
      ) : chartRows.length === 0 ? (
        <p className="mt-6 text-sm text-[#94a3b8]">
          No historical assessment scores yet for this filter. Completing practical assessments will
          appear here.
        </p>
      ) : (
        <div className="mt-4 h-64 w-full" role="img" aria-label="Line chart of assessment scores over time">
          <ul className="sr-only">
            {chartRows.map((row) => (
              <li key={row.key}>
                {row.competency}: {row.scorePercent}% on {row.dateLabel}
              </li>
            ))}
          </ul>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Score"]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { competency?: string; dateLabel?: string } | undefined;
                  return row ? `${row.competency ?? ""} · ${row.dateLabel ?? ""}` : "";
                }}
              />
              <Line
                type="monotone"
                dataKey="scorePercent"
                stroke="#023E8A"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function verificationTone(event: JourneyEventDto): string {
  switch (event.verificationClass) {
    case "skill_assessed":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "source_reported":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "integrity_checked":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
    default:
      return "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100";
  }
}

export function JourneyTimeline({ events }: { events: JourneyEventDto[] }) {
  if (events.length === 0) {
    return (
      <section className="learner-stat-card p-6 text-center" aria-label="Journey timeline">
        <p className="text-sm font-medium text-[#023E8A] dark:text-sky-100">No recorded journey events yet</p>
        <p className="mt-2 text-xs text-[#64748b]">
          This does not mean you lack skills. Connect evidence, complete assessments, or issue
          credentials to build your timeline.
        </p>
      </section>
    );
  }

  return (
    <section className="learner-stat-card p-4" aria-label="Journey timeline">
      <h2 className="mb-4 text-sm font-semibold text-[#023E8A] dark:text-sky-100">Chronological timeline</h2>
      <ol className="space-y-4">
        {events.map((event) => {
          const integrity = integrityStatusLabel(event.integrityStatus);
          const when = formatJourneyDate(event.occurredAt ?? event.recordedAt);
          const moodle = isMoodleJourneyMetadata(event.metadata);
          const lmsGrade = formatJourneyLmsGrade(event.metadata);
          const sourceLabel = moodle ? "Moodle" : sourceSystemLabel(event.sourceSystem);
          return (
            <li key={event.eventId} className="flex gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0 dark:border-slate-800">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#023E8A]" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-[#0f172a] dark:text-slate-100">{event.title}</p>
                  <time className="text-xs text-[#94a3b8]" dateTime={event.occurredAt ?? event.recordedAt}>
                    {when}
                  </time>
                </div>
                <p className="text-xs text-[#64748b]">
                  {eventTypeLabel(event.eventType)}
                  {event.competencyName ? ` · ${event.competencyName}` : ""}
                  {` · ${sourceLabel}`}
                  {lmsGrade ? ` · Grade ${lmsGrade}` : ""}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${verificationTone(event)}`}>
                    {verificationClassLabel(event.verificationClass)}
                  </span>
                  {isSnapshotOnlyMetadata(event.metadata) ? (
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
                      {GITHUB_SNAPSHOT_LABEL}
                    </span>
                  ) : null}
                  {integrity ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      {integrity}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function JourneyCredentialMilestones({ events }: { events: JourneyEventDto[] }) {
  const milestones = events.filter(
    (e) => e.eventType === "credential_issued" || e.eventType === "credential_revoked",
  );
  return (
    <section className="learner-stat-card p-4" aria-label="Credential milestones">
      <h2 className="text-sm font-semibold text-[#023E8A] dark:text-sky-100">Credential milestones</h2>
      <p className="mt-1 text-xs text-[#64748b]">
        Database anchor status alone is not live ledger verification. Unchecked means integrity was
        not verified in this view.
      </p>
      {milestones.length === 0 ? (
        <p className="mt-4 text-sm text-[#94a3b8]">No credential issue or revocation events in the loaded history.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {milestones.map((event) => (
            <li key={event.eventId} className="rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800">
              <p className="text-sm font-medium text-[#0f172a] dark:text-slate-100">{event.title}</p>
              <p className="text-xs text-[#64748b]">
                {eventTypeLabel(event.eventType)} · {formatJourneyDate(event.occurredAt ?? event.recordedAt)}
              </p>
              <p className="mt-1 text-xs">
                {verificationClassLabel(event.verificationClass)}
                {integrityStatusLabel(event.integrityStatus)
                  ? ` · ${integrityStatusLabel(event.integrityStatus)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function JourneyLoadMore({
  hasMore,
  loading,
  onLoadMore,
  error,
  onRetry,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (!hasMore && !error) return null;
  return (
    <div className="mt-4 space-y-3">
      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs sm:text-sm">Could not load more events. {error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry ?? onLoadMore}
            disabled={loading}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {hasMore ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function JourneyErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-medium text-[#023E8A]">Could not load your skill journey</p>
      <p className="max-w-md text-xs text-[#64748b]">{message}</p>
      <Button type="button" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export type { JourneyEventType };

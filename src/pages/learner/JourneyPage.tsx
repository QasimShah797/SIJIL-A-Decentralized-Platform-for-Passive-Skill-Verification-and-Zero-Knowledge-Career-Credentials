import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  JourneyCompletenessWarning,
  JourneyCredentialMilestones,
  JourneyErrorState,
  JourneyFilters,
  JourneyGrowthChart,
  JourneyHeader,
  JourneyLoadMore,
  JourneyOverviewCards,
  JourneyTimeline,
} from "@/components/journey/JourneyPagePanels";
import { mergeJourneyEvents } from "@/lib/journey-events";
import {
  fetchLearnerJourney,
  type JourneyEventDto,
  type JourneyEventType,
  type LearnerJourneyResponse,
  type SkillGrowthSeries,
} from "@/services/api/journey.api";

const PAGE_LIMIT = 50;

export default function JourneyPage() {
  const [events, setEvents] = useState<JourneyEventDto[]>([]);
  const [skillGrowth, setSkillGrowth] = useState<SkillGrowthSeries[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [truncatedSources, setTruncatedSources] = useState<string[]>([]);
  const [competencyId, setCompetencyId] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const applyPage = useCallback((data: LearnerJourneyResponse, mode: "replace" | "append") => {
    setSkillGrowth(data.skillGrowth);
    setNextCursor(data.page.nextCursor);
    setIncomplete(data.page.incomplete);
    setTruncatedSources(data.page.truncatedSources);
    setEvents((prev) => mergeJourneyEvents(prev, data.events, mode));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    setLoadMoreError(null);
    setEvents([]);
    setNextCursor(null);

    const params = {
      limit: PAGE_LIMIT,
      cursor: null as string | null,
      competencyId: competencyId === "all" ? null : competencyId,
      eventTypes: eventType === "all" ? null : [eventType as JourneyEventType],
    };

    fetchLearnerJourney(params)
      .then((data) => {
        if (cancelled) return;
        applyPage(data, "replace");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPageError(err instanceof Error ? err.message : "Failed to load journey");
        setEvents([]);
        setSkillGrowth([]);
        setNextCursor(null);
        setIncomplete(false);
        setTruncatedSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [competencyId, eventType, reloadKey, applyPage]);

  const onLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const cursor = nextCursor;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await fetchLearnerJourney({
        limit: PAGE_LIMIT,
        cursor,
        competencyId: competencyId === "all" ? null : competencyId,
        eventTypes: eventType === "all" ? null : [eventType as JourneyEventType],
      });
      applyPage(data, "append");
    } catch (err: unknown) {
      setLoadMoreError(err instanceof Error ? err.message : "Failed to load more events");
    } finally {
      setLoadingMore(false);
    }
  };

  const competencies = useMemo(() => {
    const map = new Map<string, string>();
    for (const series of skillGrowth) {
      map.set(series.competencyId, series.competencyName);
    }
    for (const event of events) {
      if (event.competencyId && event.competencyName) {
        map.set(event.competencyId, event.competencyName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events, skillGrowth]);

  const assessmentCount = events.filter((e) => e.eventType === "assessment_completed").length;
  const credentialMilestoneCount = events.filter(
    (e) => e.eventType === "credential_issued" || e.eventType === "credential_revoked",
  ).length;

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <JourneyHeader />

      {loading ? <PageSkeleton /> : null}

      {!loading && pageError ? (
        <JourneyErrorState message={pageError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : null}

      {!loading && !pageError ? (
        <>
          <JourneyCompletenessWarning incomplete={incomplete} truncatedSources={truncatedSources} />
          <JourneyFilters
            competencies={competencies}
            competencyId={competencyId}
            eventType={eventType}
            onCompetencyChange={(value) => setCompetencyId(value)}
            onEventTypeChange={(value) => setEventType(value)}
          />
          <JourneyOverviewCards
            loadedEventCount={events.length}
            assessmentCount={assessmentCount}
            credentialMilestoneCount={credentialMilestoneCount}
            hasMore={Boolean(nextCursor)}
            incomplete={incomplete}
          />
          <JourneyGrowthChart
            series={skillGrowth}
            selectedCompetencyId={competencyId}
            eventTypeFilter={eventType}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <JourneyTimeline events={events} />
              <JourneyLoadMore
                hasMore={Boolean(nextCursor)}
                loading={loadingMore}
                error={loadMoreError}
                onLoadMore={() => {
                  void onLoadMore();
                }}
                onRetry={() => {
                  void onLoadMore();
                }}
              />
            </div>
            <JourneyCredentialMilestones events={events} />
          </div>
        </>
      ) : null}
    </LearnerWorkspaceShell>
  );
}

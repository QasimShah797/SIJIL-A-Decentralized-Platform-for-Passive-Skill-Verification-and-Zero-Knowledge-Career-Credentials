import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Button } from "@/components/ui/button";
import { Building2, GitCompare, Search, Sparkles, Users, X } from "lucide-react";
import { EmptyState } from "@/components/sijil/EmptyState";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";
import { RecruiterDashboardStats, type RecruiterStatFilter } from "@/components/recruiter/RecruiterDashboardStats";
import {
  RecruiterDashboardRail,
  RecruiterPipelineCard,
  RecruiterRecentActivity,
  RecruiterRecentlyShared,
  RecruiterShortlistCard,
  RecruiterUpcomingInterviews,
  readRecruiterShortlist,
  writeRecruiterShortlist,
} from "@/components/recruiter/RecruiterDashboardPanels";
import { SijilMatchBot } from "@/components/recruiter/SijilMatchBot";
import { useCandidates } from "@/hooks/useCandidates";
import { listInterviewsApi } from "@/services/api/interview.api";
import type { ScheduledInterviewView } from "@/lib/interview";
import { cn } from "@/lib/utils";

export default function RecruiterSearch() {
  const navigate = useNavigate();
  const { candidates, candidateSkills, loading, error, refresh } = useCandidates();
  const [selected, setSelected] = useState<string[]>(() => readRecruiterShortlist());
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  const [statFilter, setStatFilter] = useState<RecruiterStatFilter>("all");
  const [campus, setCampus] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const campuses = useMemo(() => {
    const names = new Set<string>();
    for (const candidate of candidates) {
      const name = candidate.institution.trim();
      if (name && name !== "—") names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (focusIds && !focusIds.includes(candidate.id)) return false;
      if (statFilter === "verified" && candidate.attestation !== "Approved") return false;
      if (statFilter === "credentials" && (candidate.credentialCount ?? 0) <= 0) return false;
      if (campus && candidate.institution.trim() !== campus) return false;
      if (!needle) return true;
      const haystack = [
        candidate.name,
        candidate.institution,
        candidate.topSkill,
        candidate.careerGoal,
        ...(candidate.searchableSkills ?? []),
        ...(candidate.verifiedSkills ?? []),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [candidates, focusIds, statFilter, campus, query]);

  useEffect(() => {
    writeRecruiterShortlist(selected);
  }, [selected]);

  useEffect(() => {
    if (loading) return;
    const ids = new Set(candidates.map((candidate) => candidate.id));
    setSelected((current) => {
      const next = current.filter((id) => ids.has(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
  }, [candidates, loading]);

  useEffect(() => {
    let active = true;
    listInterviewsApi()
      .then((rows) => {
        if (active) setInterviews(rows);
      })
      .catch(() => {
        if (active) setInterviews([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectStat = (filter: RecruiterStatFilter) => {
    const next = filter !== "all" && statFilter === filter ? "all" : filter;
    setStatFilter(next);
    if (next !== "institutions") setCampus(null);
    if (next === "institutions") {
      window.setTimeout(() => {
        document.getElementById("directory-campuses")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 40);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const goCompare = () => {
    if (selected.length < 2) return;
    navigate(`/recruiter/compare?ids=${selected.join(",")}`);
  };

  if (loading) {
    return (
      <AppShell role="recruiter">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  return (
    <AppShell role="recruiter">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">Candidate directory</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Review learners who shared credentials. Shortlists stay limited to disclosed evidence.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-6 pb-24">
      <RecruiterDashboardStats candidates={candidates} active={statFilter} onSelect={selectStat} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecruiterPipelineCard candidates={candidates} interviews={interviews} />
        <RecruiterShortlistCard
          candidates={candidates}
          selectedIds={selected}
          onRemove={(id) => setSelected((current) => current.filter((item) => item !== id))}
          onOpen={(id) => navigate(`/recruiter/candidate/${id}`)}
          onCompare={goCompare}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecruiterUpcomingInterviews
          interviews={interviews}
          onOpen={(id) => navigate(`/recruiter/candidate/${id}`)}
        />
        <RecruiterRecentActivity candidates={candidates} interviews={interviews} />
      </div>

      <RecruiterRecentlyShared
        candidates={candidates}
        onOpen={(id) => navigate(`/recruiter/candidate/${id}`)}
      />
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Ask SIJIL Match</h2>
              <p className="text-xs text-muted-foreground">Rank and compare from disclosed evidence.</p>
            </div>
          </div>
          <SijilMatchBot
            candidates={candidates}
            candidateSkills={candidateSkills}
            selectedIds={selected}
            onClearSelection={() => setSelected([])}
            onResultIds={setFocusIds}
            onOpenCandidate={(id) => navigate(`/recruiter/candidate/${id}`)}
            onCompare={(leftId, rightId) => navigate(`/recruiter/compare?ids=${leftId},${rightId}`)}
          />
        </section>

        <section id="recruiter-directory" className="min-w-0">
          <div className="mb-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    Candidates
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                      {visible.length}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">Open a profile or select people to compare.</p>
                </div>
              </div>
              <div className="relative min-w-0 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, skill, campus"
                  className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {([
                { id: "all" as const, label: "All" },
                { id: "verified" as const, label: "Verified" },
                { id: "credentials" as const, label: "With credentials" },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={statFilter === item.id && !campus}
                  onClick={() => selectStat(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    statFilter === item.id && !campus
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {campuses.length > 0 && (
              <div id="directory-campuses" className={cn("mt-3 flex flex-wrap items-center gap-2", statFilter === "institutions" && "rounded-xl bg-primary/5 p-2")}>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Campus
                </span>
                <button
                  type="button"
                  onClick={() => setCampus(null)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    campus === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  All
                </button>
                {campuses.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={campus === name}
                    onClick={() => {
                      setCampus(campus === name ? null : name);
                      setStatFilter("institutions");
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium",
                      campus === name ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {focusIds ? (
              <button
                type="button"
                onClick={() => setFocusIds(null)}
                className="mt-3 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear match filter · show everyone
              </button>
            ) : null}
          </div>

          <div className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
            {error && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={Users}
                  title="Could not load candidates"
                  description={error}
                  action={{ label: "Try again", onClick: () => void refresh() }}
                />
              </div>
            )}
            {!error && visible.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={Users}
                  title={focusIds ? "No candidates in this answer" : candidates.length === 0 ? "No candidates yet" : "No matches"}
                  description={focusIds
                    ? "Clear the answer filter to see every shared learner."
                    : candidates.length === 0
                      ? "Learners appear here after they share a credential with recruiters."
                      : "Try another filter, campus, or search."}
                  action={focusIds
                    ? { label: "Show all", onClick: () => setFocusIds(null) }
                    : candidates.length > 0
                      ? { label: "Clear filters", onClick: () => { setStatFilter("all"); setCampus(null); setQuery(""); } }
                      : undefined}
                />
              </div>
            )}
            {visible.map((c) => (
              <RecruiterCandidateCard
                key={c.id}
                candidate={c}
                selected={selected.includes(c.id)}
                onSelectedChange={() => toggleSelect(c.id)}
                onOpenSummary={() => navigate(`/recruiter/candidate/${c.id}`)}
              />
            ))}
          </div>
        </section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <RecruiterDashboardRail
          selectedCount={selected.length}
          onCompare={() => {
            if (selected.length >= 2) goCompare();
            else document.getElementById("recruiter-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </aside>
      </div>

      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <span className="text-sm text-muted-foreground">
            {selected.length} selected {selected.length === 1 ? "candidate" : "candidates"}
          </span>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
          {selected.length >= 2 && (
            <Button size="sm" onClick={goCompare}>
              <GitCompare className="h-4 w-4 mr-1.5" />
              Compare ({selected.length})
            </Button>
          )}
        </div>
      )}
    </AppShell>
  );
}

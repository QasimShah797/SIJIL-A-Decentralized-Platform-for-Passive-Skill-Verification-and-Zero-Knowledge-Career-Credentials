import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Button } from "@/components/ui/button";
import { GitCompare, Users, X } from "lucide-react";
import { EmptyState } from "@/components/sijil/EmptyState";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";
import { RecruiterDashboardStats } from "@/components/recruiter/RecruiterDashboardStats";
import { SijilMatchBot } from "@/components/recruiter/SijilMatchBot";
import { useCandidates } from "@/hooks/useCandidates";

export default function RecruiterSearch() {
  const navigate = useNavigate();
  const { candidates, candidateSkills, loading, error, refresh } = useCandidates();
  const [selected, setSelected] = useState<string[]>([]);

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
      <div className="mb-8 rounded-2xl border border-border/60 bg-[image:var(--gradient-subtle)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[2rem] font-semibold leading-none tracking-tight text-foreground">Candidate directory</h1>
          <p className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
            {candidates.length} in directory
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Review learners who shared credentials with recruiters. Shortlists stay limited to disclosed evidence.
        </p>
      </div>

      <RecruiterDashboardStats candidates={candidates} />

      <div className="pb-24">
        <section className="min-w-0">
          <div className="mb-6">
            <SijilMatchBot
              candidates={candidates}
              candidateSkills={candidateSkills}
              onOpenCandidate={(id) => navigate(`/recruiter/candidate/${id}`)}
              onCompare={(leftId, rightId) => navigate(`/recruiter/compare?ids=${leftId},${rightId}`)}
            />
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
            {!error && candidates.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={Users}
                  title="No candidates yet"
                  description="Learners appear here after they share a credential with recruiters."
                />
              </div>
            )}
            {candidates.map((c) => (
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

import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { FilterBar } from "@/components/sijil/FilterBar";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Button } from "@/components/ui/button";
import { GitCompare, Users, X } from "lucide-react";
import { EmptyState } from "@/components/sijil/EmptyState";
import { candidateMatchesSkillQuery } from "@/lib/shared-presentation";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";
import { RecruiterDashboardStats } from "@/components/recruiter/RecruiterDashboardStats";
import { SijilMatchBot } from "@/components/recruiter/SijilMatchBot";
import { useCandidates } from "@/hooks/useCandidates";

export default function RecruiterSearch() {
  const navigate = useNavigate();
  const { candidates, candidateSkills, loading, error, refresh } = useCandidates();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return candidates
      .map((c) => {
        const skills = candidateSkills[c.id] || [];
        if (!query) return { ...c, matchedSkill: null as (typeof skills)[number] | null };
        const matched = skills.find((s) =>
          s.skill.toLowerCase().includes(query) || s.domain.toLowerCase().includes(query),
        ) ?? (c.searchableSkills ?? [])
          .filter((skill) => skill.toLowerCase().includes(query))
          .map((skill) => ({
            skill,
            domain: "Shared competency",
            evidence: c.evidence,
            reviews: c.reviews,
            lmsRecords: 0,
            githubRecords: 0,
            practicalTask: "—" as const,
            externalCert: "—" as const,
            attestation: c.attestation,
            attestationSource: c.institution,
            attestationDid: "",
            credentialId: null,
          }))[0] ?? null;
        if (!matched && !candidateMatchesSkillQuery(c, query)) return null;
        return { ...c, matchedSkill: matched };
      })
      .filter(Boolean) as Array<(typeof candidates)[number] & { matchedSkill: (typeof candidateSkills)[string][number] | null }>;
  }, [q, candidates, candidateSkills]);

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const goCompare = () => {
    if (selected.length < 2) return;
    navigate(`/recruiter/compare?ids=${selected.join(",")}${q ? `&skill=${encodeURIComponent(q)}` : ""}`);
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Talent workspace</p>
        <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Candidate directory</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Review learners who shared credentials with recruiters. Shortlists stay limited to disclosed evidence.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {q.trim()
              ? `${results.length} of ${candidates.length} matching “${q.trim()}”`
              : `${candidates.length} in directory`}
          </p>
        </div>
      </div>

      <RecruiterDashboardStats candidates={candidates} />

      <div className="grid items-start gap-6 pb-24 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <FilterBar
            className="mb-4"
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder="Filter by skill, name, or institution"
          >
            {["TypeScript", "Dart", "React", "Python"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQ(s)}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </FilterBar>

          <div className="grid gap-4 md:grid-cols-2">
            {error && (
              <div className="md:col-span-2">
                <EmptyState
                  icon={Users}
                  title="Could not load candidates"
                  description={error}
                  action={{ label: "Try again", onClick: () => void refresh() }}
                />
              </div>
            )}
            {!error && results.length === 0 && (
              <div className="md:col-span-2">
                <EmptyState
                  icon={Users}
                  title={q.trim() ? "No candidates match this filter" : "No candidates yet"}
                  description={
                    q.trim()
                      ? "Try another skill, or clear the search to see every learner in the directory."
                      : "Learners appear here once they share credentials or complete a profile."
                  }
                  action={q.trim() ? { label: "Clear search", onClick: () => setQ("") } : undefined}
                />
              </div>
            )}
            {results.map((c) => (
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

        <div className="xl:sticky xl:top-20">
          <SijilMatchBot
            candidates={candidates}
            candidateSkills={candidateSkills}
            onOpenCandidate={(id) => navigate(`/recruiter/candidate/${id}`)}
            onCompare={(leftId, rightId) => navigate(`/recruiter/compare?ids=${leftId},${rightId}`)}
          />
        </div>
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

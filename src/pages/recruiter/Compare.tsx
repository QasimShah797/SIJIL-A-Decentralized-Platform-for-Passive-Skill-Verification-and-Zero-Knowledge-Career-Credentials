import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitCompare, Search, Users } from "lucide-react";
import { useCandidates } from "@/hooks/useCandidates";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";

const MAX_COMPARE = 4;

function campusName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name || name === "—") return null;
  return name;
}

function matchesLearnerSearch(
  candidate: {
    name: string;
    institution?: string | null;
    topSkill?: string | null;
    verifiedSkills?: string[];
    searchableSkills?: string[];
    skillsSummary?: string | null;
  },
  needle: string,
) {
  if (!needle) return true;
  const haystack = [
    candidate.name,
    candidate.institution,
    candidate.topSkill,
    candidate.skillsSummary,
    ...(candidate.verifiedSkills ?? []),
    ...(candidate.searchableSkills ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export default function RecruiterCompare() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { candidates, loading } = useCandidates();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => candidates.filter((c) => ids.includes(c.id)), [candidates, ids]);

  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => matchesLearnerSearch(candidate, needle));
  }, [candidates, query]);

  const setSelectedIds = (next: string[]) => {
    const updated = new URLSearchParams(params);
    if (next.length) updated.set("ids", next.join(","));
    else updated.delete("ids");
    setParams(updated, { replace: true });
  };

  const toggleSelect = (id: string) => {
    if (ids.includes(id)) {
      setSelectedIds(ids.filter((item) => item !== id));
      return;
    }
    if (ids.length >= MAX_COMPARE) return;
    setSelectedIds([...ids, id]);
  };

  if (loading) {
    return (
      <RecruiterWorkspaceShell>
        <PageSkeleton rows={5} />
      </RecruiterWorkspaceShell>
    );
  }

  return (
    <RecruiterWorkspaceShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#023E8A] sm:text-[1.65rem]">Compare learners</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Select 2 to {MAX_COMPARE} shared profiles. Their evidence appears side by side below.
          </p>
        </div>
        <p className="text-sm font-medium text-[#023E8A]">
          {selected.length}/{MAX_COMPARE} selected
        </p>
      </div>

      <section className="learner-stat-card p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef7] text-[#023E8A]">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#023E8A]">Choose learners</h2>
              <p className="text-xs text-[#64748b]">
                {selected.length < 2 ? "Pick at least 2 people to start the comparison." : "Change the selection to update the tables."}
              </p>
            </div>
          </div>
          <div className="relative min-w-0 w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, skill, or campus"
              className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {candidates.length === 0 ? (
          <EmptyState
            icon={GitCompare}
            title="No learners yet"
            description="Learners appear here after they share a credential with your recruiter account."
            action={{ label: "Back to dashboard", onClick: () => navigate("/recruiter/search") }}
          />
        ) : filteredCandidates.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try another name, skill, or campus."
            action={{ label: "Clear search", onClick: () => setQuery("") }}
          />
        ) : (
          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredCandidates.map((candidate) => (
              <RecruiterCandidateCard
                key={candidate.id}
                candidate={candidate}
                embedded
                selected={ids.includes(candidate.id)}
                onSelectedChange={() => toggleSelect(candidate.id)}
                onOpenSummary={() => navigate(`/recruiter/candidate/${candidate.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {selected.length >= 2 ? (
        <div className="mt-6">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Comparison overview</CardTitle>
              <p className="text-xs text-muted-foreground">
                Side-by-side credentials, evidence, reviews, and verification for the selected learners.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left">Learner</th>
                    <th className="px-4 py-2 text-left">Credentials</th>
                    <th className="px-4 py-2 text-left">Evidence</th>
                    <th className="px-4 py-2 text-left">Reviews</th>
                    <th className="px-4 py-2 text-left">Verification</th>
                    <th className="px-4 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((c) => {
                    const campus = campusName(c.institution);
                    return (
                      <tr key={c.id} className="border-t border-border/60 transition-colors hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-card px-4 py-4">
                          <div className="flex items-center gap-3">
                            <CandidateAvatar name={c.name} avatarUrl={c.avatarUrl} className="h-12 w-12 ring-2 ring-primary/15" />
                            <div className="min-w-0">
                              <span className="block font-semibold" title={c.name}>{c.name}</span>
                              {campus ? <span className="block truncate text-xs text-muted-foreground">{campus}</span> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">{c.credentialCount}</td>
                        <td className="px-4 py-3">{c.evidence}</td>
                        <td className="px-4 py-3">{c.reviews}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={c.attestation === "Approved" ? "verified" : "warning"}>{c.attestation}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => navigate(`/recruiter/candidate/${c.id}`)}
                          >
                            Review <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </RecruiterWorkspaceShell>
  );
}

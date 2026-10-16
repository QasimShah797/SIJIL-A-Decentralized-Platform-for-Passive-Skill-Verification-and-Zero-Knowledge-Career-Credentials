import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitCompare, ShieldCheck, Users } from "lucide-react";
import { useCandidates } from "@/hooks/useCandidates";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";

const MAX_COMPARE = 4;

function campusName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name || name === "—") return null;
  return name;
}

export default function RecruiterCompare() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { candidates, candidateSkills, loading } = useCandidates();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const skillFilter = params.get("skill") || "";

  const selected = useMemo(() => candidates.filter((c) => ids.includes(c.id)), [candidates, ids]);

  const skillSet = useMemo(() => {
    const all = new Set<string>();
    selected.forEach((c) => (candidateSkills[c.id] || []).forEach((s) => {
      if (!skillFilter || s.skill.toLowerCase().includes(skillFilter.toLowerCase())) all.add(s.skill);
    }));
    return Array.from(all);
  }, [selected, candidateSkills, skillFilter]);

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
      <AppShell role="recruiter">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  return (
    <AppShell role="recruiter">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">Compare candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select 2 to {MAX_COMPARE} shared profiles. Their evidence appears side by side below.
          </p>
        </div>
        <p className="text-sm font-medium text-foreground">
          {selected.length}/{MAX_COMPARE} selected
        </p>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Choose candidates</h2>
            <p className="text-xs text-muted-foreground">
              {selected.length < 2 ? "Pick at least 2 people to start the comparison." : "Change the selection to update the tables."}
            </p>
          </div>
        </div>

        {candidates.length === 0 ? (
          <EmptyState
            icon={GitCompare}
            title="No candidates yet"
            description="Learners appear here after they share a credential with recruiters."
            action={{ label: "Back to dashboard", onClick: () => navigate("/recruiter/search") }}
          />
        ) : (
          <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {candidates.map((candidate) => (
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
        <div className="mt-6 space-y-6">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle className="text-base">Candidate snapshot</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left">Candidate</th>
                    <th className="px-4 py-2 text-left">Credentials</th>
                    <th className="px-4 py-2 text-left">Total evidence</th>
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
                          <Button size="sm" className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => navigate(`/recruiter/candidate/${c.id}`)}>
                            Open <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Skill-level comparison</CardTitle>
              <p className="text-xs text-muted-foreground">
                SIJIL aggregates evidence — it does not assign expert/intermediate labels. Compare counts and verification status.
                {skillFilter ? ` Skill filter: ${skillFilter}.` : ""}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[140px] bg-muted/50 px-4 py-3 text-left">Skill</th>
                    {selected.map((c) => (
                      <th key={c.id} className="min-w-[180px] px-4 py-2 text-left">{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skillSet.length === 0 && (
                    <tr><td colSpan={selected.length + 1} className="px-4 py-6 text-center text-muted-foreground">No matching skills.</td></tr>
                  )}
                  {skillSet.map((skill) => (
                    <tr key={skill} className="border-t border-border/60 align-top transition-colors hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-card px-4 py-4 font-medium">{skill}</td>
                      {selected.map((c) => {
                        const s = (candidateSkills[c.id] || []).find((x) => x.skill === skill);
                        if (!s) return <td key={c.id} className="px-4 py-3 text-xs text-muted-foreground">—</td>;
                        return (
                          <td key={c.id} className="space-y-1.5 px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <StatusBadge variant={s.attestation === "Approved" ? "verified" : "warning"} icon={<ShieldCheck className="h-3 w-3" />}>{s.attestation}</StatusBadge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Evidence: <span className="font-medium text-foreground">{s.evidence}</span> · Reviews: <span className="font-medium text-foreground">{s.reviews}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              LMS: {s.lmsRecords} · GitHub: {s.githubRecords} · Practical: {s.practicalTask}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

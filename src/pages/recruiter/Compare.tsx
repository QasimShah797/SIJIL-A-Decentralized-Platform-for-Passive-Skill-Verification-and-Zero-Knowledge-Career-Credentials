import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { Breadcrumb } from "@/components/sijil/Breadcrumb";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, GitCompare, ShieldCheck } from "lucide-react";
import { useCandidates } from "@/hooks/useCandidates";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";

export default function RecruiterCompare() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
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

  if (loading) {
    return (
      <AppShell role="recruiter">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  if (selected.length < 2) {
    return (
      <AppShell role="recruiter">
        <div className="mb-8 rounded-2xl border border-border/60 bg-[image:var(--gradient-subtle)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <Breadcrumb
            className="mb-3"
            items={[
              { label: "Dashboard", href: "/recruiter/search" },
              { label: "Compare" },
            ]}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-none tracking-tight text-foreground">Compare candidates</h1>
        </div>
        <EmptyState
          icon={GitCompare}
          title="Select candidates to compare"
          description="Pick at least 2 candidates from the dashboard to compare evidence-backed skill levels."
          action={{ label: "Back to dashboard", onClick: () => navigate("/recruiter/search") }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell role="recruiter">
      <div className="mb-8 rounded-2xl border border-border/60 bg-[image:var(--gradient-subtle)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <Breadcrumb
          className="mb-3"
          items={[
            { label: "Dashboard", href: "/recruiter/search" },
            { label: "Compare" },
          ]}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[2rem] font-semibold leading-none tracking-tight text-foreground">Compare candidates</h1>
              <p className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                {selected.length} candidates
              </p>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {`Side-by-side comparison of evidence and attestation for ${selected.length} candidate(s)${skillFilter ? ` · skill filter: ${skillFilter}` : ""}.`}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => navigate("/recruiter/search")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />Back to dashboard
          </Button>
        </div>
      </div>

      <Card className="mb-6 overflow-hidden rounded-2xl border-border/60 shadow-sm">
        <CardHeader><CardTitle className="text-base">Candidate snapshot</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left">Candidate</th>
                <th className="text-left px-4 py-2">Institution</th>
                <th className="text-left px-4 py-2">Credentials</th>
                <th className="text-left px-4 py-2">Total evidence</th>
                <th className="text-left px-4 py-2">Reviews</th>
                <th className="text-left px-4 py-2">Attestation</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((c) => (
                <tr key={c.id} className="border-t border-border/60 transition-colors hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card px-4 py-4">
                    <div className="flex items-center gap-3">
                      <CandidateAvatar name={c.name} avatarUrl={c.avatarUrl} className="h-12 w-12 ring-2 ring-primary/15" />
                      <span className="font-semibold" title={c.name}>{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.institution}</td>
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
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Skill-level comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            SIJIL aggregates evidence — it does not assign expert/intermediate labels. Compare counts and attestation source.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-muted/50 px-4 py-3 text-left">Skill</th>
                {selected.map((c) => (
                  <th key={c.id} className="text-left px-4 py-2 min-w-[180px]">{c.name}</th>
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
                      <td key={c.id} className="px-4 py-3 space-y-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge variant={s.attestation === "Approved" ? "verified" : "warning"} icon={<ShieldCheck className="h-3 w-3" />}>{s.attestation}</StatusBadge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Evidence: <span className="text-foreground font-medium">{s.evidence}</span> · Reviews: <span className="text-foreground font-medium">{s.reviews}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          LMS: {s.lmsRecords} · GitHub: {s.githubRecords} · Practical: {s.practicalTask}
                        </div>
                        <div className="text-[11px] text-muted-foreground mono truncate" title={s.attestationDid}>{s.attestationSource}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

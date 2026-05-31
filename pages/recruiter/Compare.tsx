import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { candidates, candidateSkills } from "@/lib/sijil-data";

export default function RecruiterCompare() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const skillFilter = params.get("skill") || "";

  const selected = useMemo(() => candidates.filter((c) => ids.includes(c.id)), [ids]);

  // Build matrix of candidates × skills, optionally filtered to a queried skill
  const skillSet = useMemo(() => {
    const all = new Set<string>();
    selected.forEach((c) => (candidateSkills[c.id] || []).forEach((s) => {
      if (!skillFilter || s.skill.toLowerCase().includes(skillFilter.toLowerCase())) all.add(s.skill);
    }));
    return Array.from(all);
  }, [selected, skillFilter]);

  if (selected.length < 2) {
    return (
      <AppShell role="recruiter">
        <PageHeader
          title="Compare candidates"
          description="Pick at least 2 candidates from search to compare evidence-backed skill levels."
          actions={<Button variant="outline" onClick={() => navigate("/recruiter/search")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to search</Button>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell role="recruiter">
      <PageHeader
        title="Compare candidates"
        description={`Side-by-side comparison of evidence and attestation for ${selected.length} candidate(s)${skillFilter ? ` · skill filter: ${skillFilter}` : ""}.`}
        actions={<Button variant="outline" onClick={() => navigate("/recruiter/search")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to search</Button>}
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Candidate snapshot</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Candidate</th>
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
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.institution}</td>
                  <td className="px-4 py-3">{c.credentialCount}</td>
                  <td className="px-4 py-3">{c.evidence}</td>
                  <td className="px-4 py-3">{c.reviews}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={c.attestation === "Approved" ? "verified" : "warning"}>{c.attestation}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/recruiter/candidate/${c.id}`)}>
                      Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill-level comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            SIJIL aggregates evidence — it does not assign expert/intermediate labels. Compare counts and attestation source.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Skill</th>
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
                <tr key={skill} className="border-t align-top">
                  <td className="px-4 py-3 font-medium">{skill}</td>
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

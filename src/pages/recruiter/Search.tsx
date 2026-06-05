import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, GitCompare, ArrowRight, ShieldCheck, X } from "lucide-react";
import { candidates, candidateSkills } from "@/lib/sijil-data";

export default function RecruiterSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("React");
  const [selected, setSelected] = useState<string[]>([]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return candidates.map((c) => ({ ...c, matchedSkill: null as any }));
    return candidates
      .map((c) => {
        const skills = candidateSkills[c.id] || [];
        const matched = skills.find((s) => s.skill.toLowerCase().includes(query) || s.domain.toLowerCase().includes(query));
        return matched ? { ...c, matchedSkill: matched } : null;
      })
      .filter(Boolean) as any[];
  }, [q]);

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const goCompare = () => {
    if (selected.length < 2) return;
    navigate(`/recruiter/compare?ids=${selected.join(",")}${q ? `&skill=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <AppShell role="recruiter">
      <PageHeader
        title="Search candidates"
        description="Find candidates by skill. Results are backed by verifiable credentials, attestations and supporting evidence."
        actions={
          selected.length >= 2 && (
            <Button onClick={goCompare}>
              <GitCompare className="h-4 w-4 mr-1.5" /> Compare ({selected.length})
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by skill (e.g. React.js, Node.js, PostgreSQL, Python)"
              />
            </div>
            <Button onClick={() => { /* live search */ }}>Search</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["React", "Node", "Python", "PostgreSQL", "Docker"].map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                {s}
              </button>
            ))}
            <span className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">Verification: Verified</span>
            <span className="px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">Has credential: Yes</span>
          </div>
          {selected.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{selected.length} selected for comparison</span>
              <button onClick={() => setSelected([])} className="inline-flex items-center gap-1 text-foreground hover:underline">
                <X className="h-3 w-3" /> clear
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {results.length === 0 && (
          <div className="md:col-span-2 text-center text-sm text-muted-foreground py-12">
            No candidates match this skill yet.
          </div>
        )}
        {results.map((c: any) => (
          <Card key={c.id} className={selected.includes(c.id) ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onCheckedChange={() => toggleSelect(c.id)}
                    aria-label="Select to compare"
                  />
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                    {c.name.split(" ").map((n: string) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.institution}</div>
                  </div>
                </div>
                <StatusBadge variant={c.attestation === "Approved" ? "verified" : "warning"} icon={<ShieldCheck className="h-3 w-3" />}>
                  {c.attestation}
                </StatusBadge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Stat label={c.matchedSkill ? "Matched skill" : "Top skill"} value={c.matchedSkill?.skill || c.topSkill} small />
                <Stat label="Evidence" value={c.matchedSkill?.evidence ?? c.evidence} />
                <Stat label="Reviews" value={c.matchedSkill?.reviews ?? c.reviews} />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{c.credentialCount} verifiable credentials</div>
                <Button size="sm" onClick={() => navigate(`/recruiter/candidate/${c.id}`)}>
                  Open summary <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, small }: { label: string; value: any; small?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={small ? "text-xs font-medium mt-0.5 truncate" : "text-base font-semibold mt-0.5"}>{value}</div>
    </div>
  );
}

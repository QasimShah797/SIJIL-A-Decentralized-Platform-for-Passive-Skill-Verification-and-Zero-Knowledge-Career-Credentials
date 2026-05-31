import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, RefreshCw, Github, ExternalLink } from "lucide-react";
import { validationSummary, declaredSkills } from "@/lib/sijil-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type LinkedRepo = {
  id: string;
  repo_name: string;
  full_name: string;
  github_url: string;
  primary_language: string | null;
  commit_count: number | null;
  last_updated: string | null;
};

export default function Validation() {
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId: string }>();
  const { user } = useAuth();
  const v = validationSummary;
  const skill = declaredSkills.find((s) => s.id === skillId);
  const [linkedRepos, setLinkedRepos] = useState<LinkedRepo[]>([]);

  useEffect(() => {
    if (!user || !skillId) return;
    supabase
      .from("github_repos")
      .select("id, repo_name, full_name, github_url, primary_language, commit_count, last_updated")
      .eq("user_id", user.id)
      .eq("linked_skill_id", skillId)
      .order("last_updated", { ascending: false, nullsFirst: false })
      .then(({ data }) => setLinkedRepos((data ?? []) as LinkedRepo[]));
  }, [user, skillId]);
  return (
    <AppShell role="learner">
      <PageHeader
        title="Validation Trail & Supporting Evidence"
        description="An evidence-driven view of what supports this skill. SIJIL surfaces the trail — it does not declare a final expertise label."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/learner/wallet")}>View credential <ArrowRight className="h-4 w-4 ml-1.5" /></Button>
            <Button><ShieldCheck className="h-4 w-4 mr-1.5" />Ready for Credential Issuance</Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Skill</div>
            <div className="text-xl font-semibold mt-1">{v.skill}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge variant="verified">Result: {v.result}</StatusBadge>
              <StatusBadge variant="info">{v.status}</StatusBadge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 grid grid-cols-2 gap-4">
            <Stat label="Supporting Records" value={v.supportingRecords} />
            <Stat label="Reviews" value={v.reviewCount} />
            <Stat label="Last Evaluated" value={v.evaluatedOn} />
            <Stat label="Latest Activity" value={v.latestActivity} />
            <Stat label="Related Practical Task" value={v.task} />
            <Stat label="Current Status" value={v.status} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-2">Contributing sources</div>
            <div className="flex flex-wrap gap-2">
              {v.sources.map((s) => <StatusBadge key={s} variant="neutral">{s}</StatusBadge>)}
            </div>
            <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Re-evaluation runs when new records are imported.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Supporting evidence rows</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b">
            <div className="col-span-5">Source name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Role in validation</div>
          </div>
          <div className="divide-y">
            {v.rows.map((r) => (
              <button
                key={r.name}
                onClick={() => navigate("/learner/wallet")}
                className="w-full grid grid-cols-12 px-6 py-3.5 text-sm text-left hover:bg-muted/40 transition"
              >
                <div className="col-span-5 font-medium">{r.name}</div>
                <div className="col-span-2 text-muted-foreground">{r.type}</div>
                <div className="col-span-2 text-muted-foreground">{r.date}</div>
                <div className="col-span-3 flex items-center justify-between">
                  <span>{r.role}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GitHub Evidence Linked */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-4 w-4" /> Evidence Linked — GitHub Repositories
          </CardTitle>
          {skill && <StatusBadge variant="info">{skill.status}</StatusBadge>}
        </CardHeader>
        <CardContent>
          {linkedRepos.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No GitHub repositories linked to this skill yet. Sync GitHub from{" "}
              <button onClick={() => navigate("/learner/integrations")} className="text-primary hover:underline">Integrations</button>{" "}
              — repositories whose primary language matches this skill will be linked automatically.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {linkedRepos.map((r) => (
                <a
                  key={r.id}
                  href={r.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border bg-card p-3 hover:shadow-sm transition flex flex-col"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{r.repo_name}</span>
                    <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mb-2">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-auto">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary/70" />
                      {r.primary_language ?? "Language not detected"}
                    </span>
                    {typeof r.commit_count === "number" && <span>{r.commit_count} commits</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

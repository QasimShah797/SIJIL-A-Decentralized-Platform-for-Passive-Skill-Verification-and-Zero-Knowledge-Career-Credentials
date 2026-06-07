import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, RefreshCw, Github, ExternalLink } from "lucide-react";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { buildValidationSummary, type ValidationSummary } from "@/lib/db/validation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const skill = skills.find((s) => s.id === skillId);
  const [v, setV] = useState<ValidationSummary | null>(null);
  const [linkedRepos, setLinkedRepos] = useState<LinkedRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !skillId || !skill) {
      setLoading(false);
      return;
    }
    setLoading(true);
    buildValidationSummary(user.id, skill).then(setV).finally(() => setLoading(false));
  }, [user, skillId, skill]);

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

  if (skillsLoading || loading) {
    return (
      <AppShell role="learner">
        <div className="text-sm text-muted-foreground">Loading validation trail…</div>
      </AppShell>
    );
  }

  if (!skill || !v) {
    return (
      <AppShell role="learner">
        <PageHeader title="Skill not found" description="Declare a skill on your profile first." />
        <Button onClick={() => navigate("/learner/profile")}>Go to profile</Button>
      </AppShell>
    );
  }

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
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Evidence records</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate("/learner/integrations")}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync evidence
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {v.rows.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">
              No evidence linked yet. Connect GitHub or LMS and sync your portfolio.
            </div>
          ) : (
            <div className="divide-y">
              {v.rows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center">
                  <div className="col-span-5 text-sm font-medium">{row.name}</div>
                  <div className="col-span-2"><StatusBadge variant="neutral">{row.type}</StatusBadge></div>
                  <div className="col-span-2 text-xs text-muted-foreground">{row.date}</div>
                  <div className="col-span-3 text-xs text-muted-foreground">{row.role}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {linkedRepos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Github className="h-4 w-4" /> Linked repositories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedRepos.map((r) => (
              <a key={r.id} href={r.github_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/40 text-sm">
                <span>{r.full_name}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

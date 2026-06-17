import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, RefreshCw, Github, ExternalLink, ChevronRight } from "lucide-react";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { buildAllValidationSummaries, buildValidationSummary, type ValidationSummary } from "@/lib/db/validation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PIPELINE_STAGES, pipelineStageIndex } from "@/lib/competency-pipeline";

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
  const { skillId } = useParams<{ skillId?: string }>();
  const { user } = useAuth();
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const skill = skillId ? skills.find((s) => s.id === skillId) : undefined;
  const [v, setV] = useState<ValidationSummary | null>(null);
  const [allSummaries, setAllSummaries] = useState<ValidationSummary[]>([]);
  const [linkedRepos, setLinkedRepos] = useState<LinkedRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!skillId) {
      buildAllValidationSummaries(user.id, skills)
        .then(setAllSummaries)
        .finally(() => setLoading(false));
      return;
    }
    if (!skill) {
      setLoading(false);
      return;
    }
    buildValidationSummary(user.id, skill).then(setV).finally(() => setLoading(false));
  }, [user, skillId, skill, skills]);

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

  if (!skillId) {
    return (
      <AppShell role="learner">
        <PageHeader
          title="Validation Trail"
          description="Current location of each declared competency in the verification pipeline."
        />
        {skills.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No declared competencies yet. Declare a skill on your profile first.
              <div className="mt-4">
                <Button onClick={() => navigate("/learner/profile")}>Go to profile</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {allSummaries.map((summary) => (
              <PipelineCard
                key={summary.skillId}
                summary={summary}
                onOpen={() => navigate(`/learner/validation/${summary.skillId}`)}
              />
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  if (!skill || !v) {
    if (skills.length > 0) {
      return (
        <AppShell role="learner">
          <PageHeader title="Validation Trail" description="Select a declared competency to view its pipeline status." />
          <div className="grid md:grid-cols-2 gap-4">
            {skills.map((s) => (
              <Card key={s.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/learner/validation/${s.id}`)}>
                <CardContent className="p-5 flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell role="learner">
        <PageHeader title="No competencies" description="Declare a skill on your profile first." />
        <Button onClick={() => navigate("/learner/profile")}>Go to profile</Button>
      </AppShell>
    );
  }

  const walletReady = v.pipelineStage === "wallet_ready" || v.pipelineStage === "in_wallet";
  const stageIdx = pipelineStageIndex(v.pipelineStage);

  return (
    <AppShell role="learner">
      <PageHeader
        title="Validation Trail & Supporting Evidence"
        description="An evidence-driven view of what supports this skill. SIJIL surfaces the trail — it does not declare a final expertise label."
        actions={
          <>
            {walletReady && (
              <Button variant="outline" onClick={() => navigate("/learner/wallet")}>
                View credential <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {walletReady && (
              <Button onClick={() => navigate("/learner/wallet")}>
                <ShieldCheck className="h-4 w-4 mr-1.5" />Add to wallet
              </Button>
            )}
          </>
        }
      />

      <PipelineCard summary={v} showStages className="mb-6" />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Pipeline stages</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const isRejected = v.pipelineStage === "institution_attestation_rejected"
                || v.pipelineStage === "institution_rejected";
              const active = i <= stageIdx && !isRejected;
              const stageRejected = isRejected && stage.key === "institution_attestation_pending";
              return (
                <StatusBadge
                  key={stage.key}
                  variant={stageRejected ? "destructive" : active ? "verified" : "neutral"}
                >
                  {stage.label}
                  {stageRejected ? " (Rejected)" : ""}
                </StatusBadge>
              );
            })}
            {v.pipelineStage === "in_wallet" && (
              <StatusBadge variant="verified">In Wallet</StatusBadge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardContent className="p-5 grid grid-cols-2 gap-4">
            <Stat label="Supporting Records" value={v.supportingRecords} />
            <Stat label="Reviews" value={v.reviewCount} />
            <Stat label="Last Evaluated" value={v.evaluatedOn} />
            <Stat label="Latest Activity" value={v.latestActivity} />
            <Stat label="Related Practical Task" value={v.task} />
            <Stat label="Institution" value={v.institution} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
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

function PipelineCard({
  summary,
  onOpen,
  showStages,
  className,
}: {
  summary: ValidationSummary;
  onOpen?: () => void;
  showStages?: boolean;
  className?: string;
}) {
  const variant =
    summary.pipelineStage === "institution_attestation_rejected" || summary.pipelineStage === "institution_rejected" ? "destructive" :
    summary.pipelineStage === "wallet_ready" || summary.pipelineStage === "in_wallet" ? "verified" :
    summary.pipelineStage === "institution_attestation_pending" ? "warning" : "info";

  return (
    <Card className={className} onClick={onOpen} role={onOpen ? "button" : undefined}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Skill</div>
            <div className="text-lg font-semibold">{summary.skill}</div>
          </div>
          {onOpen && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-muted-foreground">Current Stage</div>
            <StatusBadge variant={variant} className="mt-1">{summary.currentStageLabel}</StatusBadge>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Evidence</div>
            <div className="mt-1">{summary.evidence}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Institution</div>
            <div className="mt-1">{summary.institution}</div>
          </div>
          {summary.evidencePackageSent && (
            <div>
              <div className="text-[11px] text-muted-foreground">Evidence Package</div>
              <div className="mt-1">Sent</div>
            </div>
          )}
          {summary.institutionFeedback && (
            <div className="sm:col-span-2">
              <div className="text-[11px] text-muted-foreground">Institution feedback</div>
              <div className="mt-1 text-muted-foreground">{summary.institutionFeedback}</div>
            </div>
          )}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Next Step: </span>
          {summary.nextStep}
        </div>
        {showStages && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PIPELINE_STAGES.map((stage, i) => {
              const active = i <= pipelineStageIndex(summary.pipelineStage);
              return (
                <span
                  key={stage.key}
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    active ? "bg-primary/10 border-primary/30 text-foreground" : "text-muted-foreground border-border"
                  }`}
                >
                  {stage.label}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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

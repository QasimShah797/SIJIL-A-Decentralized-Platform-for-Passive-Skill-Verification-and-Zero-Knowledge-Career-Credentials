import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { type PipelineStage as StepperStage } from "@/components/sijil/PipelineStepper";
import { shortDid } from "@/components/learner/ProfilePagePanels";
import {
  ValidationBreadcrumbBar,
  ValidationDetailHero,
  ValidationDetailStats,
  ValidationEmptyState,
  ValidationEvidenceTable,
  ValidationFooter,
  ValidationLinkedReposPanel,
  ValidationListHero,
  ValidationNextStepPanel,
  ValidationPipelineCard,
  ValidationSkillOverviewCard,
  ValidationSourcesPanel,
  ValidationStatsGrid,
  ValidationTrailCard,
} from "@/components/validation/ValidationPagePanels";
import { useDeclaredSkills, useLearnerProfile } from "@/hooks/useLearnerData";
import {
  buildAllValidationSummaries,
  buildValidationSummary,
  createFallbackValidationSummary,
  type ValidationSummary,
} from "@/lib/db/validation";
import { issueCredentialForSkill } from "@/lib/db/credentials";
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

function isWalletStage(stage: string) {
  return stage === "wallet_ready" || stage === "in_wallet";
}

export default function Validation() {
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId?: string }>();
  const { user } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const skill = skillId ? skills.find((s) => s.id === skillId) : undefined;
  const [v, setV] = useState<ValidationSummary | null>(null);
  const [allSummaries, setAllSummaries] = useState<ValidationSummary[]>([]);
  const [linkedRepos, setLinkedRepos] = useState<LinkedRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!skillId || skillsLoading) return;
    if (skills.length > 0 && !skill) {
      navigate("/learner/validation", { replace: true });
    }
  }, [skillId, skill, skills.length, skillsLoading, navigate]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!skillId) {
      if (skills.length === 0) {
        setAllSummaries([]);
        setLoading(false);
        return;
      }
      buildAllValidationSummaries(user.id, skills)
        .then(setAllSummaries)
        .finally(() => setLoading(false));
      return;
    }
    if (!skill) {
      setV(null);
      setLoading(false);
      return;
    }
    setV(null);
    buildValidationSummary(user.id, skill)
      .then(setV)
      .catch((error) => {
        console.error("Validation summary failed:", error);
        setV(createFallbackValidationSummary(skill));
      })
      .finally(() => setLoading(false));
  }, [user, skillId, skill?.id, skills]);

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

  const listSummaries = useMemo(
    () => (allSummaries.length > 0 ? allSummaries : skills.map(createFallbackValidationSummary)),
    [allSummaries, skills],
  );

  const listStats = useMemo(() => {
    let walletReady = 0;
    let inProgress = 0;
    let evidenceRecords = 0;
    for (const summary of listSummaries) {
      if (isWalletStage(summary.pipelineStage)) walletReady += 1;
      else inProgress += 1;
      evidenceRecords += summary.supportingRecords;
    }
    return {
      total: listSummaries.length,
      walletReady,
      inProgress,
      evidenceRecords,
    };
  }, [listSummaries]);

  const didShort = profile?.did ? shortDid(profile.did) : undefined;

  if (skillsLoading || loading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={4} />
      </LearnerWorkspaceShell>
    );
  }

  if (!skillId) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <ValidationBreadcrumbBar didShort={didShort} />
        <ValidationListHero competencyCount={skills.length} />

        {skills.length === 0 ? (
          <ValidationEmptyState onGoProfile={() => navigate("/learner/profile")} />
        ) : (
          <>
            <ValidationStatsGrid
              total={listStats.total}
              walletReady={listStats.walletReady}
              inProgress={listStats.inProgress}
              evidenceRecords={listStats.evidenceRecords}
            />
            <div className="space-y-3">
              {listSummaries.map((summary, index) => (
                <ValidationTrailCard
                  key={summary.skillId}
                  summary={summary}
                  index={index}
                  onOpen={() => navigate(`/learner/validation/${summary.skillId}`)}
                />
              ))}
            </div>
          </>
        )}

        <ValidationFooter />
      </LearnerWorkspaceShell>
    );
  }

  if (!skill) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <ValidationBreadcrumbBar didShort={didShort} />
        <ValidationListHero competencyCount={skills.length} />
        <div className="space-y-3">
          {skills.map((s, index) => (
            <ValidationTrailCard
              key={s.id}
              summary={listSummaries.find((summary) => summary.skillId === s.id) ?? createFallbackValidationSummary(s)}
              index={index}
              onOpen={() => navigate(`/learner/validation/${s.id}`)}
            />
          ))}
        </div>
        <ValidationFooter />
      </LearnerWorkspaceShell>
    );
  }

  const summary = v ?? createFallbackValidationSummary(skill);
  const walletReady = isWalletStage(summary.pipelineStage);
  const stageIdx = pipelineStageIndex(summary.pipelineStage);

  const pipelineStages: StepperStage[] = [
    ...PIPELINE_STAGES.map((stage, i) => ({
      id: stage.key,
      label: stage.label,
      status: (i < stageIdx ? "complete" : i === stageIdx ? "current" : "upcoming") as StepperStage["status"],
    })),
    ...(summary.pipelineStage === "in_wallet"
      ? [{ id: "in_wallet", label: "In Wallet", status: "complete" as const }]
      : []),
  ];

  const openIntegrations = () => navigate("/learner/integrations");
  const openWallet = () => navigate("/learner/wallet");
  const issueCredential = async () => {
    if (user && skillId) await issueCredentialForSkill(user.id, skillId);
    navigate("/learner/wallet");
  };

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <ValidationBreadcrumbBar didShort={didShort} skillName={summary.skill} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <ValidationDetailHero
            summary={summary}
            walletReady={walletReady}
            onOpenWallet={openWallet}
            onIssueCredential={() => void issueCredential()}
          />

          <ValidationSkillOverviewCard summary={summary} />
          <ValidationPipelineCard stages={pipelineStages} />
          <ValidationDetailStats summary={summary} />
          <ValidationEvidenceTable rows={summary.rows} onSyncEvidence={openIntegrations} />
          <ValidationLinkedReposPanel repos={linkedRepos} />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <ValidationNextStepPanel nextStep={summary.nextStep} />
          <ValidationSourcesPanel sources={summary.sources} />
        </aside>
      </div>

      <ValidationFooter />
    </LearnerWorkspaceShell>
  );
}

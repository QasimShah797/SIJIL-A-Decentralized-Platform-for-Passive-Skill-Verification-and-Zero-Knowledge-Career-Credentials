import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
  Layers,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineStepper, type PipelineStage as StepperStage } from "@/components/sijil/PipelineStepper";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, pipelineStageIndex, VERIFICATION_STAGE_TOOLTIP } from "@/lib/competency-pipeline";
import type { ValidationSummary } from "@/lib/db/validation";

const SKILL_COLORS = ["hsl(var(--sijil-blue))", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#8b5cf6"];

function skillInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function skillColor(index: number): string {
  return SKILL_COLORS[index % SKILL_COLORS.length];
}

function stageTone(stage: string): "verified" | "progress" | "attention" | "neutral" {
  if (stage === "wallet_ready" || stage === "in_wallet") return "verified";
  if (
    stage === "verification_failed" ||
    stage === "institution_attestation_rejected" ||
    stage === "institution_rejected"
  ) {
    return "attention";
  }
  if (stage === "declared") return "neutral";
  return "progress";
}

const STAGE_BADGE: Record<ReturnType<typeof stageTone>, string> = {
  verified: "bg-[#ecfdf5] text-[#059669] border-[#bbf7d0]",
  progress: "bg-[hsl(var(--sijil-blue)/0.04)] text-sijil-blue border-[hsl(var(--sijil-blue)/0.17)]",
  attention: "bg-[#fef9c3] text-[#CA8A04] border-[#fde68a]",
  neutral: "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]",
};

export function ValidationBreadcrumbBar(_props: {
  didShort?: string;
  skillName?: string;
}) {
  return null;
}

export function ValidationListHero({ competencyCount }: { competencyCount: number }) {
  void competencyCount;
  return (
    <section className="cp-hero mb-6 overflow-hidden rounded-2xl px-5 py-6 sm:px-7">
      <div className="relative z-[1] flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sijil-blue text-white shadow-lg shadow-[hsl(var(--sijil-blue)/0.3)]">
          <BarChart3 className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[1.75rem]">
          Competency Progress
        </h1>
      </div>
    </section>
  );
}

export function ValidationDetailHero({
  summary,
  walletReady,
  onOpenWallet,
  onIssueCredential,
}: {
  summary: ValidationSummary;
  walletReady: boolean;
  onOpenWallet: () => void;
  onIssueCredential: () => void;
}) {
  const tone = stageTone(summary.pipelineStage);

  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--sijil-blue)/0.17)] bg-[hsl(var(--sijil-blue)/0.04)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sijil-blue">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Competency validation
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#0f172a] sm:text-[1.65rem]">{summary.skill}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", STAGE_BADGE[tone])}>
            {summary.currentStageLabel}
          </span>
          <span className="text-xs text-[#64748b]">{summary.evidence}</span>
        </div>
      </div>
      {walletReady && (
        <div className="flex max-w-md shrink-0 flex-col gap-2">
          <p className="text-xs text-[#475569]">
            A verified credential is a signed record of this competency. It uses the evidence SIJIL has already accepted. It does not re-check the original project, course, or review content.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl border-[#e2e8f0]" onClick={onOpenWallet}>
              Open wallet record
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onIssueCredential}>
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Get verified proof
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ValidationStatsGrid({
  total,
  walletReady,
  inProgress,
  evidenceRecords,
}: {
  total: number;
  walletReady: number;
  inProgress: number;
  evidenceRecords: number;
}) {
  const items = [
    {
      label: "Declared Skills",
      value: String(total),
      icon: Layers,
      iconClass: "bg-[hsl(var(--sijil-blue)/0.1)] text-sijil-blue",
      cardClass: "bg-[hsl(var(--sijil-blue)/0.04)]",
    },
    {
      label: "Ready for Credential",
      value: String(walletReady),
      icon: Wallet,
      iconClass: "bg-[#dcfce7] text-[#16a34a]",
      cardClass: "bg-[#f0fdf4]",
    },
    {
      label: "In Progress",
      value: String(inProgress),
      icon: CircleDot,
      iconClass: "bg-[#ffedd5] text-[#ea580c]",
      cardClass: "bg-[#fff7ed]",
    },
    {
      label: "Supporting Records",
      value: String(evidenceRecords),
      icon: FileText,
      iconClass: "bg-[#ede9fe] text-[#7c3aed]",
      cardClass: "bg-[#f5f3ff]",
    },
  ];

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl px-5 py-4 shadow-sm",
            item.cardClass,
          )}
        >
          <div className="min-w-0">
            <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl", item.iconClass)}>
              <item.icon className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-sm font-medium text-[#64748b]">{item.label}</p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#0f172a]">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function progressBadge(stage: string): { label: string; className: string; icon: typeof Wallet | typeof Layers } {
  if (stage === "in_wallet" || stage === "wallet_ready") {
    return {
      label: "In Wallet",
      className: "bg-[#dcfce7] text-[#15803d]",
      icon: Wallet,
    };
  }
  if (stage === "declared") {
    return {
      label: "Declared Skill",
      className: "bg-[hsl(var(--sijil-blue)/0.1)] text-sijil-blue",
      icon: Layers,
    };
  }
  if (stage === "practical_task") {
    return {
      label: "Practical Task",
      className: "bg-[#ffedd5] text-[#c2410c]",
      icon: CircleDot,
    };
  }
  if (stage === "evidence_linked") {
    return {
      label: "Evidence",
      className: "bg-[hsl(var(--sijil-blue)/0.08)] text-sijil-blue",
      icon: FileText,
    };
  }
  if (stage === "peer_review" || stage === "verification_pending" || stage === "institution_attestation_pending") {
    return {
      label: "Verification",
      className: "bg-[#ede9fe] text-[#6d28d9]",
      icon: Layers,
    };
  }
  return {
    label: "In Progress",
    className: "bg-[#e2e8f0] text-[#475569]",
    icon: CircleDot,
  };
}

export function ValidationTrailCard({
  summary,
  index,
}: {
  summary: ValidationSummary;
  index: number;
  onOpen?: () => void;
}) {
  const stageIdx = pipelineStageIndex(summary.pipelineStage);
  const mainStages = PIPELINE_STAGES.filter(({ key }) => key !== "verification");
  const completedStages = [true, stageIdx >= 1, summary.assessmentCompleted === true, stageIdx >= 4];
  // Keep the reference's 60% after Assessment. Wallet accounts for the remaining 40%.
  const progress = completedStages.reduce((total, complete, index) => total + (complete ? (index === 3 ? 40 : 20) : 0), 0);
  const badge = progressBadge(summary.pipelineStage);
  const BadgeIcon = badge.icon;
  const peerComplete = summary.hasEligiblePeerReview === true;

  return (
    <div className="rounded-2xl border border-[hsl(var(--sijil-blue)/0.07)] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: skillColor(index) }}
        >
          {skillInitials(summary.skill)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-[#0f172a]">{summary.skill}</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  badge.className,
                )}
              >
                <BadgeIcon className="h-3 w-3" aria-hidden />
                {badge.label}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-[hsl(var(--sijil-blue)/0.04)] px-3 py-1 text-xs font-bold tabular-nums text-sijil-blue">
                {progress}%
              </span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#94a3b8]"
                aria-hidden
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="cp-stepper mt-6">
            <svg className="cp-stepper-lines" viewBox="0 0 100 68" preserveAspectRatio="none" aria-hidden="true">
              {[[10, 30], [30, 50], [50, 90]].map(([from, to], i) => (
                <path key={from} className={cn("cp-stepper-line", completedStages[i] && completedStages[i + 1] && "cp-stepper-line--complete")} d={`M ${from} 16 H ${to}`} />
              ))}
              <path className={cn("cp-peer-branch", peerComplete && "cp-stepper-line--complete")} d="M 50 16 C 54 55 63 68 70 68 M 70 68 C 77 68 86 55 90 16" />
            </svg>
            <ol className="cp-main-stages relative z-[1] grid grid-cols-5">
              {mainStages.map((stage, i) => {
                const reached = completedStages[i];
                return (
                  <li key={stage.key} className={cn("flex flex-col items-center gap-2 text-center", i === 3 && "col-start-5")}>
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-[2.5px]",
                        reached
                          ? "border-sijil-blue bg-sijil-blue text-white"
                          : "border-[#cbd5e1] bg-white text-transparent",
                      )}
                      aria-label={`${stage.label}${reached ? " complete" : ""}`}
                    >
                      {reached ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium sm:text-xs",
                        reached ? "text-[#334155]" : "text-[#94a3b8]",
                      )}
                    >
                      {stage.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className={cn("cp-peer-node", peerComplete && "cp-peer-node--complete")}>
              <span className="cp-peer-circle" aria-label={peerComplete ? "Peer Review complete" : "Peer Review optional"}>
                {peerComplete ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span>Peer Review<br />(Optional)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ValidationSkillOverviewCard({ summary }: { summary: ValidationSummary }) {
  const tone = stageTone(summary.pipelineStage);

  return (
    <div className="learner-stat-card mb-6 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Current stage</p>
          <span className={cn("mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold", STAGE_BADGE[tone])}>
            {summary.currentStageLabel}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Evidence status</p>
          <p className="mt-2 text-sm font-medium text-[#0f172a]">{summary.evidence}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Supporting records</p>
          <p className="mt-2 text-sm font-medium text-sijil-blue">{summary.supportingRecords}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Next step</p>
          <p className="mt-2 text-sm leading-relaxed text-[#334155]">{summary.nextStep}</p>
        </div>
      </div>
      {summary.evidencePackageSent && (
        <p className="mt-4 rounded-lg border border-[#bbf7d0] bg-[#ecfdf5] px-3 py-2 text-xs text-[#059669]">
          Evidence package sent for verification review.
        </p>
      )}
    </div>
  );
}

export function ValidationPipelineCard({ stages }: { stages: StepperStage[] }) {
  return (
    <div className="learner-stat-card mb-6 p-5">
      <p className="text-sm font-semibold text-sijil-blue">Pipeline progress</p>
      <div className="vt-pipeline-stepper mt-4">
        <PipelineStepper stages={stages} />
      </div>
      <p className="mt-4 rounded-lg bg-[#f8fafc] px-3 py-2.5 text-xs leading-relaxed text-[#64748b]">
        <span className="font-semibold text-[#334155]">Verification — </span>
        {VERIFICATION_STAGE_TOOLTIP}
      </p>
    </div>
  );
}

export function ValidationDetailStats({
  summary,
}: {
  summary: ValidationSummary;
}) {
  const items = [
    { label: "Supporting records", value: summary.supportingRecords },
    { label: "Peer reviews", value: summary.reviewCount },
    { label: "Last evaluated", value: summary.evaluatedOn },
    { label: "Latest activity", value: summary.latestActivity },
    { label: "Practical task", value: summary.task },
    { label: "Result", value: summary.result || "—" },
  ];

  return (
    <div className="learner-stat-card mb-6 p-4">
      <p className="mb-3 text-sm font-semibold text-sijil-blue">Trail summary</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-[#0f172a]">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ValidationSourcesPanel({ sources }: { sources: string[] }) {
  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-sijil-blue">Contributing sources</p>
      {sources.length === 0 ? (
        <p className="mt-3 text-xs text-[#94a3b8]">No linked sources yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((source) => (
            <span
              key={source}
              className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-medium text-[#334155]"
            >
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ValidationNextStepPanel({ nextStep }: { nextStep: string }) {
  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-sijil-blue">Recommended action</p>
      <p className="mt-2 text-sm leading-relaxed text-[#334155]">{nextStep}</p>
    </div>
  );
}

export function ValidationEvidenceTable({
  rows,
  onSyncEvidence,
}: {
  rows: ValidationSummary["rows"];
  onSyncEvidence: () => void;
}) {
  return (
    <div className="learner-stat-card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-4">
        <p className="text-sm font-semibold text-sijil-blue">Evidence records</p>
        <Button variant="outline" size="sm" className="rounded-xl border-[#e2e8f0]" onClick={onSyncEvidence}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Sync evidence
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <Github className="mb-3 h-8 w-8 text-[#94a3b8]" />
          <p className="font-semibold text-[#0f172a]">No evidence linked yet</p>
          <p className="mt-1 max-w-sm text-sm text-[#64748b]">
            Connect GitHub or LMS and sync your portfolio to populate supporting records.
          </p>
          <Button className="mt-4 rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onSyncEvidence}>
            Open integrations
          </Button>
        </div>
      ) : (
        <div className="vt-evidence-table overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
                <th className="px-5 py-3">Record</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-5 py-3.5 font-medium text-[#0f172a]">{row.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-0.5 text-[10px] font-medium text-[#64748b]">
                      {row.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#64748b]">{row.date}</td>
                  <td className="px-5 py-3.5 text-xs text-[#64748b]">{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type LinkedRepo = {
  id: string;
  full_name: string;
  github_url: string;
  primary_language: string | null;
  commit_count: number | null;
};

export function ValidationLinkedReposPanel({ repos }: { repos: LinkedRepo[] }) {
  if (repos.length === 0) return null;

  return (
    <div className="learner-stat-card overflow-hidden">
      <div className="border-b border-[#e2e8f0] px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-sijil-blue">
          <Github className="h-4 w-4" />
          Linked repositories
        </p>
      </div>
      <ul className="divide-y divide-[#f1f5f9]">
        {repos.map((repo) => (
          <li key={repo.id}>
            <a
              href={repo.github_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-[#fafafa]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[#0f172a]">{repo.full_name}</p>
                <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                  {[repo.primary_language, repo.commit_count != null ? `${repo.commit_count} commits` : null]
                    .filter(Boolean)
                    .join(" · ") || "GitHub repository"}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ValidationEmptyState({ onGoProfile }: { onGoProfile: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center px-6 py-14 text-center">
      <GitBranch className="mb-3 h-9 w-9 text-[#94a3b8]" />
      <p className="font-semibold text-[#0f172a]">No declared competencies yet</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">
        Declare a skill on your profile first to track its verification pipeline.
      </p>
      <Button className="mt-4 rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onGoProfile}>
        Go to profile
      </Button>
    </div>
  );
}

export function ValidationFooter() {
  return (
    <footer className="mt-10 border-t border-[#e2e8f0] pt-6 text-center text-xs text-[#94a3b8]">
      SIJIL · Learner verification workspace
    </footer>
  );
}

import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Github,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineStepper, type PipelineStage as StepperStage } from "@/components/sijil/PipelineStepper";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, pipelineStageIndex, VERIFICATION_STAGE_TOOLTIP } from "@/lib/competency-pipeline";
import type { ValidationSummary } from "@/lib/db/validation";

const SKILL_COLORS = ["#023E8A", "#CA8A04", "#059669", "#DC2626", "#0891B2", "#7C3AED"];

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
  progress: "bg-[#eff6ff] text-[#023E8A] border-[#bfdbfe]",
  attention: "bg-[#fef9c3] text-[#CA8A04] border-[#fde68a]",
  neutral: "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]",
};

export function ValidationBreadcrumbBar({
  didShort,
  skillName,
}: {
  didShort?: string;
  skillName?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
        <Link to="/learner/profile" className="hover:text-[#023E8A]">
          Learner
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span>Verification workspace</span>
        <ChevronRight className="h-3 w-3" aria-hidden />
        {skillName ? (
          <>
            <Link to="/learner/validation" className="hover:text-[#023E8A]">
              Validation Trail
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="font-semibold text-[#023E8A]">{skillName}</span>
          </>
        ) : (
          <span className="font-semibold text-[#023E8A]">Validation Trail</span>
        )}
      </nav>
      {didShort ? (
        <span className="mono rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[10px] text-[#64748b]">
          {didShort}
        </span>
      ) : null}
    </div>
  );
}

export function ValidationListHero({ competencyCount }: { competencyCount: number }) {
  return (
    <div className="mb-5">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#023E8A]">
        <Route className="h-3 w-3" aria-hidden />
        Evidence-driven verification
      </p>
      <h1 className="mt-3 text-2xl font-bold text-[#0f172a] sm:text-[1.65rem]">Validation Trail</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#64748b]">
        Track each declared competency through the SIJIL verification pipeline — from linked evidence to wallet-ready credentials.
      </p>
      {competencyCount > 0 && (
        <p className="mt-2 text-xs font-medium text-[#94a3b8]">
          {competencyCount} declared competenc{competencyCount === 1 ? "y" : "ies"} in pipeline
        </p>
      )}
    </div>
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
        <p className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#023E8A]">
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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl border-[#e2e8f0]" onClick={onOpenWallet}>
            Open wallet record
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onIssueCredential}>
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Issue verified credential
          </Button>
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
    { label: "Declared competencies", value: String(total), hint: "Active in verification pipeline" },
    { label: "Wallet ready", value: String(walletReady), hint: "Eligible for credential issuance" },
    { label: "In progress", value: String(inProgress), hint: "Evidence or assessment pending" },
    { label: "Evidence records", value: String(evidenceRecords), hint: "Linked supporting records" },
  ];

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="learner-stat-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-[#023E8A]">{item.value}</p>
          <p className="mt-1 text-[11px] text-[#94a3b8]">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function ValidationTrailCard({
  summary,
  index,
  onOpen,
}: {
  summary: ValidationSummary;
  index: number;
  onOpen: () => void;
}) {
  const tone = stageTone(summary.pipelineStage);
  const stageIdx = pipelineStageIndex(summary.pipelineStage);
  const progress = Math.round(((stageIdx + 1) / PIPELINE_STAGES.length) * 100);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="learner-stat-card vt-trail-card group w-full p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: skillColor(index) }}
        >
          {skillInitials(summary.skill)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[#0f172a] group-hover:text-[#023E8A]">{summary.skill}</h3>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#94a3b8] group-hover:text-[#023E8A]" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", STAGE_BADGE[tone])}>
              {summary.currentStageLabel}
            </span>
            <span className="text-[11px] text-[#64748b]">{summary.evidence}</span>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] text-[#64748b]">
              <span>Pipeline progress</span>
              <span className="font-semibold tabular-nums text-[#023E8A]">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div
                className="h-full rounded-full bg-[#023E8A] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#64748b]">
            <span className="font-medium text-[#334155]">Next: </span>
            {summary.nextStep}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {PIPELINE_STAGES.map((stage, i) => (
              <span
                key={stage.key}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] font-medium",
                  i <= stageIdx
                    ? "border-[#bfdbfe] bg-[#eff6ff] text-[#023E8A]"
                    : "border-[#e2e8f0] bg-white text-[#94a3b8]",
                )}
              >
                {stage.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
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
          <p className="mt-2 text-sm font-medium text-[#023E8A]">{summary.supportingRecords}</p>
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
      <p className="text-sm font-semibold text-[#023E8A]">Pipeline progress</p>
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
      <p className="mb-3 text-sm font-semibold text-[#023E8A]">Trail summary</p>
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
      <p className="text-sm font-semibold text-[#023E8A]">Contributing sources</p>
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
      <p className="text-sm font-semibold text-[#023E8A]">Recommended action</p>
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
        <p className="text-sm font-semibold text-[#023E8A]">Evidence records</p>
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
          <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onSyncEvidence}>
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
        <p className="flex items-center gap-2 text-sm font-semibold text-[#023E8A]">
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
      <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoProfile}>
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

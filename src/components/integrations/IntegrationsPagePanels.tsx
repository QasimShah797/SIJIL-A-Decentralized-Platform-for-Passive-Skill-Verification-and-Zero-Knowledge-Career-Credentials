import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FolderSync, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CoverageRing({ percent }: { percent: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const len = (percent / 100) * c;

  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="#023E8A"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${len} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-[#023E8A]">{percent}%</span>
      </div>
    </div>
  );
}

function SourceBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const width = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-[#334155]">{label}</span>
        <span className="tabular-nums text-[#64748b]">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function IntegrationsBreadcrumbBar({
  didShort,
  allSynced,
}: {
  didShort?: string;
  allSynced?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
        <Link to="/learner/profile" className="hover:text-[#023E8A]">
          Learner workspace
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span>Evidence</span>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-semibold text-[#023E8A]">Integrations</span>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        {allSynced !== false && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#ecfdf5] px-2.5 py-1 text-[10px] font-medium text-[#059669]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" aria-hidden />
            All systems synced
          </span>
        )}
        {didShort ? (
          <span className="mono rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[10px] text-[#64748b]">
            ID: {didShort}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PortfolioCoverageCard({
  mappedCount,
  totalSlots,
  githubCount,
  lmsCount,
  certCount,
  className,
}: {
  mappedCount: number;
  totalSlots: number;
  githubCount: number;
  lmsCount: number;
  certCount: number;
  className?: string;
}) {
  const percent = totalSlots > 0 ? Math.round((mappedCount / totalSlots) * 100) : 0;
  const barMax = Math.max(githubCount, lmsCount, certCount, 4, 1);

  return (
    <div className={cn("learner-stat-card flex h-full flex-col justify-center gap-4 p-5 sm:flex-row sm:items-center", className)}>
      <CoverageRing percent={percent} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#023E8A]">
          {mappedCount} of {totalSlots} evidence slots mapped
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
          Based on your current progress, you need to map more competencies. Certificates remain unmapped.
        </p>
        <div className="mt-4 space-y-2.5">
          <SourceBar label="GitHub" count={githubCount} max={barMax} color="#023E8A" />
          <SourceBar label="Moodle LMS" count={lmsCount} max={barMax} color="#f97316" />
          <SourceBar label="Certificates" count={certCount} max={barMax} color="#8b5cf6" />
        </div>
      </div>
    </div>
  );
}

export function IntegrationsHero({
  portfolioSyncing,
  onSyncPortfolio,
  onAddIntegration,
  onViewSyncLog,
  coverage,
  summary,
}: {
  portfolioSyncing: boolean;
  onSyncPortfolio: () => void;
  onAddIntegration: () => void;
  onViewSyncLog: () => void;
  coverage: {
    mappedCount: number;
    totalSlots: number;
    githubCount: number;
    lmsCount: number;
    certCount: number;
  };
  summary?: ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6366f1]">External data sources</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0f172a] sm:text-[1.65rem]">External Integrations</h1>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
              onClick={onSyncPortfolio}
              disabled={portfolioSyncing}
            >
              <FolderSync className={cn("mr-1.5 h-4 w-4", portfolioSyncing && "animate-spin")} />
              {portfolioSyncing ? "Syncing…" : "Sync Portfolio"}
            </Button>
            <Button variant="outline" className="rounded-xl border-[#e2e8f0]" onClick={onAddIntegration}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add integration
            </Button>
            <button
              type="button"
              onClick={onViewSyncLog}
              className="px-2 text-sm font-medium text-[#023E8A] hover:underline"
            >
              View sync log
            </button>
          </div>
        </div>
        {summary ? <div className="min-w-0 flex-1">{summary}</div> : null}
      </div>
      <PortfolioCoverageCard {...coverage} className="h-full" />
    </div>
  );
}

export function IntegrationsFooter() {
  const auditDate = new Date().toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  return (
    <footer className="mt-10 flex flex-col gap-2 border-t border-[#e2e8f0] pt-6 text-xs text-[#64748b] sm:flex-row sm:items-center sm:justify-between">
      <p>SIJIL · Decentralized professional skill verification</p>
      <p>Evidence integrity verified · last audit {auditDate}</p>
    </footer>
  );
}

export function ConnectedSourcesHeader({ onManageAll }: { onManageAll?: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[#023E8A]">Connected sources</h2>
        <p className="mt-0.5 text-xs text-[#64748b]">
          Manage platform connections and synchronize evidence from external systems.
        </p>
      </div>
      {onManageAll ? (
        <button type="button" onClick={onManageAll} className="text-xs font-medium text-[#023E8A] hover:underline">
          Manage all
        </button>
      ) : null}
    </div>
  );
}

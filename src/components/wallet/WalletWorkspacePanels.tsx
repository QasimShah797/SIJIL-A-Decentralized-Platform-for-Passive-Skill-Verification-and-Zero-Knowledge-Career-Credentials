import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Github,
  GraduationCap,
  Link2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareExportActions } from "@/components/public/ShareExportActions";
import { TrustTierBadge } from "@/components/public/TrustTierBadge";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import type { WalletAttemptHistoryItem, WalletShareFieldId } from "@/lib/wallet-competency-shared";
import type { PracticalPackageSummary } from "@/lib/public-credential";
import type { WalletShareRecordView } from "@/services/api/wallet.api";
import type { WalletAnchorBadge } from "@/lib/ledger-status";

export type InspectorSource = "github" | "lms" | "task" | "reviews";

export type ConnectedSourceRow = {
  id: string;
  label: string;
  detail: string;
  lastSync: string | null;
  verified: boolean;
  available: boolean;
};

export type LedgerEvent = {
  id: string;
  at: string;
  hash: string;
  source: string;
};

export type CommitChartPoint = {
  label: string;
  commits: number;
};

export type GithubPackageStats = {
  repos: number;
  commits: number | null;
  activities: number;
  pullRequests: number;
  languages: string[];
  commitSeries: CommitChartPoint[];
};

export type LmsCourseRow = {
  id: string;
  name: string;
  assignments: number;
  scoreLabel: string;
  scorePercent: number | null;
};

export type ShareToggle = {
  id: WalletShareFieldId;
  label: string;
  enabled: boolean;
  available: boolean;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return "Never synced";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Never synced";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function shortHash(value: string | null | undefined): string {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 10)}…${raw.slice(-6)}`;
}

export function WalletWorkspaceHeader({
  competencyName,
  records,
  selectedId,
  onSelect,
  statusLabel,
  verified,
  lastSync,
  anchorStatus,
  anchorByCompetencyId,
}: {
  competencyName: string;
  records: WalletCompetencyRecordView[];
  selectedId: string;
  onSelect: (competencyId: string) => void;
  statusLabel: string;
  verified: boolean;
  lastSync: string | null;
  anchorStatus?: WalletAnchorBadge | null;
  anchorByCompetencyId?: Record<string, WalletAnchorBadge | null>;
}) {
  const recent = lastSync
    ? Date.now() - new Date(lastSync).getTime() < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="learner-stat-card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-[#023E8A]">My Secure Wallet</p>
        <span className="hidden h-4 w-px bg-[#e2e8f0] sm:block" />
        {records.length > 1 ? (
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger className="h-9 w-[240px] rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder={competencyName} />
            </SelectTrigger>
            <SelectContent>
              {records.map((record) => {
                const badge = anchorByCompetencyId?.[record.competencyId];
                return (
                  <SelectItem key={record.competencyId} value={record.competencyId}>
                    {record.competencyName}
                    {badge ? (
                      <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
                    ) : null}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium text-[#0f172a]">{competencyName}</p>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            verified ? "bg-[#ecfdf5] text-[#059669]" : "bg-[#f1f5f9] text-[#64748b]",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", verified ? "bg-[#059669]" : "bg-[#94a3b8]")} />
          {statusLabel}
        </span>
        {anchorStatus ? (
          <StatusBadge variant={anchorStatus.variant}>{anchorStatus.label}</StatusBadge>
        ) : null}
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
          recent ? "bg-[#ecfdf5] text-[#059669]" : "bg-[#f8fafc] text-[#64748b]",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", recent ? "bg-[#22c55e]" : "bg-[#94a3b8]")} />
        Evidence sync · {formatRelative(lastSync)}
      </span>
    </div>
  );
}

export function WalletStepper() {
  const steps = [
    "1. Connected Sources",
    "2. Competency Package",
    "3. One-Click Share",
  ];
  return (
    <div className="wallet-stepper mb-5">
      {steps.map((step, index) => (
        <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#059669]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{step}</span>
          </div>
          {index < steps.length - 1 ? <div className="wallet-stepper-line" /> : null}
        </div>
      ))}
    </div>
  );
}

export function ConnectedSourcesCard({
  sources,
  onConnect,
}: {
  sources: ConnectedSourceRow[];
  onConnect: () => void;
}) {
  const verifiedSources = sources.filter((source) => source.verified);

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Confirmed Data Sources</p>
      {verifiedSources.length === 0 ? (
        <div className="mt-3">
          <p className="text-xs text-[#94a3b8]">No verified sources are linked to this competency yet.</p>
          <Button className="mt-3 w-full rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onConnect}>
            Connect sources
          </Button>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {verifiedSources.map((source) => (
            <li key={source.id} className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-[#0f172a]">{source.label}</p>
                  <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#059669]">
                    Verified
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#64748b]">{source.detail}</p>
                <p className="text-[11px] text-[#94a3b8]">Last sync · {formatRelative(source.lastSync)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuditLedgerCard({ events }: { events: LedgerEvent[] }) {
  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Audit & Chain Ledger</p>
      <p className="mt-1 text-[11px] text-[#94a3b8]">Evidence anchors from synced platform data</p>
      {events.length === 0 ? (
        <p className="mt-4 text-xs text-[#94a3b8]">No ledger events yet for this competency.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {events.map((event) => (
            <li key={event.id} className="wallet-ledger-row rounded-lg bg-[#f8fafc] px-2.5 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2 text-[#64748b]">
                <span>{formatWhen(event.at)}</span>
                <span className="uppercase">{event.source}</span>
              </div>
              <p className="mt-0.5 break-all text-[#023E8A]">{shortHash(event.hash)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommitActivityChart({ points }: { points: CommitChartPoint[] }) {
  const peak = Math.max(...points.map((point) => point.commits), 0);
  if (peak <= 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] text-[#94a3b8]">Commit activity</p>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              width={22}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, Math.max(2, peak)]}
            />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as CommitChartPoint | undefined;
                if (!point) return null;
                return (
                  <div className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="text-[#64748b]">{point.label}</p>
                    <p className="font-semibold text-[#023E8A]">{point.commits} commit{point.commits === 1 ? "" : "s"}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="commits" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function attemptOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatSittingTime(iso: string | null): string {
  if (!iso) return "Time not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function scoredPracticalAttempts(attempts: WalletAttemptHistoryItem[]): WalletAttemptHistoryItem[] {
  return attempts
    .filter((item) => item.scorePercent != null || item.passed)
    .slice()
    .sort((a, b) => new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime());
}

export function PracticalTaskProgress({ attempts }: { attempts: WalletAttemptHistoryItem[] }) {
  const sittings = scoredPracticalAttempts(attempts);
  if (sittings.length === 0) return null;

  const first = sittings[0]?.scorePercent ?? null;
  const latest = sittings[sittings.length - 1]?.scorePercent ?? null;
  const best = sittings.reduce<number | null>((highest, item) => {
    if (item.scorePercent == null) return highest;
    return highest == null ? item.scorePercent : Math.max(highest, item.scorePercent);
  }, null);
  const retakes = Math.max(0, sittings.length - 1);
  const delta = first != null && latest != null ? latest - first : null;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#f8fafc] px-2 py-2 ring-1 ring-[#e2e8f0]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Sittings</p>
          <p className="text-lg font-bold text-[#023E8A]">{sittings.length}</p>
        </div>
        <div className="rounded-lg bg-[#f8fafc] px-2 py-2 ring-1 ring-[#e2e8f0]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Retakes</p>
          <p className="text-lg font-bold text-[#023E8A]">{retakes}</p>
        </div>
        <div className="rounded-lg bg-[#f8fafc] px-2 py-2 ring-1 ring-[#e2e8f0]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Progress</p>
          <p className={cn("text-lg font-bold", delta != null && delta >= 0 ? "text-[#059669]" : "text-[#CA8A04]")}>
            {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#64748b]">
        {first != null && latest != null
          ? `First attempt ${first}% · latest ${latest}%${best != null ? ` · best ${best}%` : ""}`
          : "Each sitting stays on the record."}
        {retakes > 0 ? ` · ${retakes} retake${retakes === 1 ? "" : "s"}` : " · no retakes yet"}
      </p>
      <ol className="pt-attempt-timeline mt-3">
        {sittings.map((item, index) => {
          const previous = index > 0 ? sittings[index - 1]?.scorePercent ?? null : null;
          const change = item.scorePercent != null && previous != null ? item.scorePercent - previous : null;
          const passed = item.passed || (item.scorePercent != null && Number.isFinite(item.scorePercent));
          return (
            <li key={item.attemptId} className="pt-attempt-timeline-item">
              <span className={cn("pt-attempt-dot", passed ? "pt-attempt-dot--pass" : "pt-attempt-dot--retry")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold text-[#0f172a]">
                    {attemptOrdinal(index + 1)} attempt
                    {index > 0 ? <span className="font-medium text-[#64748b]"> · retake</span> : null}
                  </p>
                  <p className={cn("text-xs font-bold tabular-nums", passed ? "text-[#059669]" : "text-[#CA8A04]")}>
                    {item.scorePercent != null ? `${item.scorePercent}%` : "—"}
                    <span className="ml-1 font-semibold">{item.status}</span>
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-[#64748b]">{formatSittingTime(item.submittedAt)}</p>
                {change != null && change !== 0 ? (
                  <p className={cn("mt-0.5 text-[11px] font-medium", change > 0 ? "text-[#059669]" : "text-[#CA8A04]")}>
                    {change > 0 ? "+" : ""}
                    {change} pts vs {attemptOrdinal(index)} attempt
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CompetencyPackageCard({
  competencyName,
  github,
  lmsRows,
  taskLabel,
  attempts = [],
  practicalSummary = null,
  reviews = [],
}: {
  competencyName: string;
  github: GithubPackageStats;
  lmsRows: LmsCourseRow[];
  taskLabel: string | null;
  attempts?: WalletAttemptHistoryItem[];
  practicalSummary?: PracticalPackageSummary | null;
  reviews?: Array<{ reviewer: string; text: string }>;
}) {
  const githubOpen = github.repos > 0 || github.activities > 0;
  const lmsOpen = lmsRows.length > 0;
  const scoredAttempts = scoredPracticalAttempts(attempts);
  const hasPractical = Boolean(practicalSummary) || scoredAttempts.length > 0 || Boolean(taskLabel);
  const hasReviews = reviews.length > 0;
  const hasVerifiedEvidence = githubOpen || lmsOpen || hasPractical || hasReviews;

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Package summary</p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        GitHub, LMS, practical task, and peer reviews for {competencyName}.
      </p>

      {!hasVerifiedEvidence ? (
        <p className="mt-4 text-xs text-[#94a3b8]">No verified evidence is linked yet for this competency.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {githubOpen ? (
          <details className="rounded-xl border border-[#e2e8f0] p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-[#023E8A]" />
                <span className="text-sm font-semibold text-[#0f172a]">GitHub</span>
                <span className="learner-tag-linked">Verified</span>
              </div>
              <ChevronDown className="h-4 w-4 text-[#94a3b8]" />
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] text-[#94a3b8]">Repositories</p>
                <p className="text-lg font-semibold text-[#023E8A]">{github.repos}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#94a3b8]">Commits</p>
                <p className="text-lg font-semibold text-[#023E8A]">{github.commits == null ? "Not disclosed" : github.commits}</p>
              </div>
              {github.activities > 0 ? (
                <div>
                  <p className="text-[11px] text-[#94a3b8]">Activities</p>
                  <p className="text-lg font-semibold text-[#023E8A]">{github.activities}</p>
                </div>
              ) : null}
              {github.pullRequests > 0 ? (
                <div>
                  <p className="text-[11px] text-[#94a3b8]">Pull requests</p>
                  <p className="text-lg font-semibold text-[#023E8A]">{github.pullRequests}</p>
                </div>
              ) : null}
            </div>
            {github.languages.length > 0 ? (
              <p className="mt-2 text-xs text-[#64748b]">Languages · {github.languages.join(", ")}</p>
            ) : null}
            {github.commitSeries.length > 0 ? <CommitActivityChart points={github.commitSeries} /> : null}
          </details>
        ) : null}

        <details className="rounded-xl border border-[#e2e8f0] p-3" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-[#023E8A]" />
              <span className="text-sm font-semibold text-[#0f172a]">Moodle / LMS</span>
              {lmsOpen ? (
                <span className="learner-tag-linked">Verified</span>
              ) : (
                <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                  Not shared
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-[#94a3b8]" />
          </summary>
          {lmsOpen ? (
            <table className="mt-3 w-full text-left text-xs">
              <thead className="text-[#94a3b8]">
                <tr>
                  <th className="pb-2 font-medium">Course</th>
                  <th className="pb-2 font-medium">Modules</th>
                  <th className="pb-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {lmsRows.map((row) => (
                  <tr key={row.id} className="border-t border-[#f1f5f9]">
                    <td className="py-2 pr-2 font-medium text-[#0f172a]">{row.name}</td>
                    <td className="py-2 text-[#64748b]">{row.assignments}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-[#023E8A]">
                          {row.scorePercent != null ? `${row.scorePercent}%` : row.scoreLabel}
                        </span>
                        {row.scorePercent != null ? (
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className="h-full rounded-full bg-[#14b8a6]"
                              style={{ width: `${Math.max(0, Math.min(100, row.scorePercent))}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-4 text-center">
              <GraduationCap className="mx-auto h-5 w-5 text-[#94a3b8]" />
              <p className="mt-2 text-sm font-medium text-[#334155]">No LMS evidence shared</p>
              <p className="mt-1 text-xs text-[#64748b]">
                This learner has not disclosed Moodle or LMS course scores for this competency.
              </p>
            </div>
          )}
        </details>

        <details className="rounded-xl border border-[#e2e8f0] p-3" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#023E8A]" />
              <span className="text-sm font-semibold text-[#0f172a]">Practical task</span>
              {hasPractical ? (
                <span className="learner-tag-linked">Shared</span>
              ) : (
                <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                  Not shared
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-[#94a3b8]" />
          </summary>
          {hasPractical ? (
            <div className="mt-3 space-y-3">
              {scoredAttempts.length > 0 ? <PracticalTaskProgress attempts={attempts} /> : null}
              {practicalSummary ? (
                <PracticalThresholdSummary summary={practicalSummary} fallbackLabel={taskLabel} />
              ) : taskLabel && scoredAttempts.length === 0 ? (
                <p className="text-xs font-semibold text-[#023E8A]">{taskLabel}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-4 text-center">
              <ClipboardList className="mx-auto h-5 w-5 text-[#94a3b8]" />
              <p className="mt-2 text-sm font-medium text-[#334155]">No practical task shared</p>
              <p className="mt-1 text-xs text-[#64748b]">
                This learner has not disclosed a practical-task result for this competency.
              </p>
            </div>
          )}
        </details>

        <details className="rounded-xl border border-[#e2e8f0] p-3" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#023E8A]" />
              <span className="text-sm font-semibold text-[#0f172a]">Peer reviews</span>
              {hasReviews ? (
                <span className="learner-tag-linked">{reviews.length}</span>
              ) : (
                <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                  Not shared
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-[#94a3b8]" />
          </summary>
          {hasReviews ? (
            <ul className="mt-3 space-y-2">
              {reviews.map((review, index) => (
                <li key={`${review.reviewer}-${index}`} className="rounded-lg bg-[#f8fafc] px-3 py-2 ring-1 ring-[#e2e8f0]">
                  <p className="text-xs font-semibold text-[#0f172a]">{review.reviewer}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{review.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-4 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-[#94a3b8]" />
              <p className="mt-2 text-sm font-medium text-[#334155]">No peer reviews shared</p>
              <p className="mt-1 text-xs text-[#64748b]">
                Peer reviews linked to this competency on SIJIL will appear here when disclosed.
              </p>
            </div>
          )}
        </details>
      </div>
    </div>
  );
}

function PracticalThresholdSummary({
  summary,
  fallbackLabel,
}: {
  summary: PracticalPackageSummary;
  fallbackLabel: string | null;
}) {
  const bandEntries = (["60", "70", "80"] as const)
    .map((key) => ({ key, side: summary.bands[key] }))
    .filter((item): item is { key: "60" | "70" | "80"; side: "above" | "below" } => Boolean(item.side));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#f8fafc] px-2 py-2 ring-1 ring-[#e2e8f0]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Sittings</p>
          <p className="text-lg font-bold text-[#023E8A]">{summary.sittings}</p>
        </div>
        <div className="rounded-lg bg-[#f8fafc] px-2 py-2 ring-1 ring-[#e2e8f0]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Latest</p>
          <p className="text-sm font-bold text-[#023E8A]">
            {summary.exactScorePercent != null
              ? `${summary.exactScorePercent}%`
              : (summary.latestStatus || fallbackLabel || "Submitted")}
          </p>
        </div>
      </div>

      {summary.exactScorePercent != null ? (
        <p className="text-[11px] text-[#64748b]">
          Exact latest score disclosed · {summary.latestStatus ?? "Completed"}
        </p>
      ) : (
        <div className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
          <p className="text-[11px] font-semibold text-[#0f172a]">Exact score not disclosed</p>
          {summary.latestVsReference ? (
            <p className={cn(
              "mt-1 text-xs font-semibold",
              summary.latestVsReference === "above" ? "text-[#059669]" : "text-[#CA8A04]",
            )}>
              Latest result is {summary.latestVsReference} the {summary.referenceThreshold}% threshold
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#64748b]">
              Threshold comparison is unavailable for this share.
            </p>
          )}
          {bandEntries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bandEntries.map((item) => (
                <span
                  key={item.key}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    item.side === "above"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700",
                  )}
                >
                  {item.key}% · {item.side}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function EvidenceInspectorCard({
  source,
  onSourceChange,
  availableSources,
  githubRepos,
  lmsAssignments,
  taskDetail,
  attempts = [],
  reviews,
  onViewPackage,
  verifyUrl,
}: {
  source: InspectorSource;
  onSourceChange: (next: InspectorSource) => void;
  availableSources: InspectorSource[];
  githubRepos: Array<{ name: string; language: string | null; commits: number | null; url: string | null }>;
  lmsAssignments: Array<{ name: string; course: string; grade: string }>;
  taskDetail: string | null;
  attempts?: WalletAttemptHistoryItem[];
  reviews: Array<{ reviewer: string; text: string }>;
  onViewPackage?: () => void;
  verifyUrl?: string | null;
}) {
  const labels: Record<InspectorSource, string> = {
    github: "GitHub",
    lms: "Moodle / LMS",
    task: "Practical task",
    reviews: "Peer reviews",
  };

  return (
    <div className="learner-stat-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#023E8A]">Evidence Inspector</p>
        {availableSources.length > 0 ? (
          <Select value={source} onValueChange={(value) => onSourceChange(value as InspectorSource)}>
            <SelectTrigger className="h-8 w-[160px] rounded-lg border-[#e2e8f0] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableSources.map((item) => (
                <SelectItem key={item} value={item}>{labels[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {source === "github" && (githubRepos.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">No GitHub repositories are linked to this competency.</p>
        ) : githubRepos.map((repo) => {
          const href = repo.url && /^https?:\/\//i.test(repo.url) ? repo.url : null;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium text-[#0f172a]">{repo.name}</p>
                <TrustTierBadge trustTier="corroborating" trustTierLabel="Corroborating" />
              </div>
              <p className="text-[11px] text-[#64748b]">
                {[repo.language, repo.commits != null ? `${repo.commits} commits` : "Commit count not disclosed"].filter(Boolean).join(" · ")}
              </p>
              {href ? (
                <p className="mt-1 text-[11px] font-semibold text-[#023E8A]">Open on GitHub</p>
              ) : null}
            </>
          );
          return href ? (
            <a
              key={repo.name}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-[#e2e8f0] px-3 py-2 transition hover:border-[#c5d4eb] hover:bg-[#f8fafc]"
            >
              {body}
            </a>
          ) : (
            <div key={repo.name} className="rounded-lg border border-[#e2e8f0] px-3 py-2">
              {body}
            </div>
          );
        }))}

        {source === "lms" && (lmsAssignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-5 text-center">
            <GraduationCap className="mx-auto h-5 w-5 text-[#94a3b8]" />
            <p className="mt-2 text-sm font-medium text-[#334155]">No LMS evidence available</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">
              No Moodle or LMS assignments, grades, or course scores were shared for this competency.
            </p>
          </div>
        ) : lmsAssignments.map((item) => (
          <div key={`${item.course}-${item.name}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[#0f172a]">{item.name}</p>
              <TrustTierBadge trustTier="lms_preverified" trustTierLabel="LMS pre-verified" />
            </div>
            <p className="mt-1 text-[11px] text-[#64748b]">{item.course}</p>
            <p className="mt-1 text-xs font-semibold text-[#023E8A]">
              Score · {item.grade && item.grade !== "—" ? item.grade : "Not disclosed"}
            </p>
          </div>
        )))}

        {source === "task" && (
          <div className="rounded-lg border border-[#e2e8f0] px-3 py-2">
            <div className="mb-2">
              <TrustTierBadge trustTier="corroborating" trustTierLabel="Corroborating" />
            </div>
            {scoredPracticalAttempts(attempts).length > 0 ? (
              <PracticalTaskProgress attempts={attempts} />
            ) : (
              <p className="text-sm text-[#334155]">{taskDetail ?? "No practical task result is stored yet."}</p>
            )}
          </div>
        )}

        {source === "reviews" && (reviews.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">No peer reviews are linked to this competency.</p>
        ) : reviews.map((review, index) => (
          <div key={`${review.reviewer}-${index}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[#0f172a]">{review.reviewer}</p>
              <TrustTierBadge trustTier="corroborating" trustTierLabel="Corroborating" />
            </div>
            <p className="mt-1 text-xs text-[#64748b]">{review.text}</p>
          </div>
        )))}
      </div>

      {onViewPackage || verifyUrl ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full rounded-xl"
          onClick={() => {
            if (onViewPackage) {
              onViewPackage();
              return;
            }
            if (verifyUrl) window.open(verifyUrl, "_blank", "noreferrer");
          }}
        >
          Verify at source
        </Button>
      ) : null}
    </div>
  );
}

export function OneClickShareCard({
  toggles,
  onToggle,
  photoPreviewUrl,
  shareScope,
  onShareScopeChange,
  selectedCompetencyName,
  competencyCount,
  expiresInDays,
  onExpiresChange,
  shareUrl,
  tokenHint,
  expiresAt,
  shares,
  submitting,
  onGenerate,
  onRevoke,
  shareToken,
  shareId,
}: {
  toggles: ShareToggle[];
  onToggle: (id: WalletShareFieldId, next: boolean) => void;
  photoPreviewUrl?: string | null;
  shareScope: "all" | "selected" | "issued";
  onShareScopeChange: (scope: "all" | "selected" | "issued") => void;
  selectedCompetencyName?: string;
  competencyCount?: number;
  expiresInDays: number;
  onExpiresChange: (days: number) => void;
  shareUrl: string | null;
  tokenHint: string | null;
  expiresAt: string | null;
  shares: WalletShareRecordView[];
  submitting: boolean;
  onGenerate: () => void;
  onRevoke: (shareId: string) => void;
  shareToken?: string | null;
  shareId?: string | null;
}) {
  const activeShare = shares.find((share) => share.shareStatus === "Active");

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">One-Click Share & Link Management</p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        Choose the competency scope and the fields recruiters can see.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onShareScopeChange("all")}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left",
            shareScope === "all"
              ? "border-[#023E8A] bg-[#eff6ff] text-[#023E8A]"
              : "border-[#e2e8f0] bg-white text-[#334155]",
          )}
        >
          <span className="block text-sm font-medium">All competencies</span>
          <span className="mt-0.5 block text-[11px] text-[#64748b]">
            {competencyCount && competencyCount > 1
              ? `Share ${competencyCount} wallet competencies`
              : "Share every competency in this wallet"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onShareScopeChange("selected")}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left",
            shareScope === "selected"
              ? "border-[#023E8A] bg-[#eff6ff] text-[#023E8A]"
              : "border-[#e2e8f0] bg-white text-[#334155]",
          )}
        >
          <span className="block text-sm font-medium">Selected only</span>
          <span className="mt-0.5 block text-[11px] text-[#64748b]">
            {selectedCompetencyName ? `Only ${selectedCompetencyName}` : "Only the competency currently open"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onShareScopeChange("issued")}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left",
            shareScope === "issued"
              ? "border-[#023E8A] bg-[#eff6ff] text-[#023E8A]"
              : "border-[#e2e8f0] bg-white text-[#334155]",
          )}
        >
          <span className="block text-sm font-medium">Issued credentials only</span>
          <span className="mt-0.5 block text-[11px] text-[#64748b]">
            Exclude unissued skills from the public resume
          </span>
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {toggles.map((toggle) => (
          <label key={toggle.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              {toggle.id === "learner_photo" && photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover"
                />
              ) : null}
              <span className="min-w-0">
                <span className={cn("block text-sm", toggle.available ? "text-[#334155]" : "text-[#94a3b8]")}>
                  {toggle.label}
                </span>
                {!toggle.available ? (
                  <span className="block text-[11px] text-[#94a3b8]">
                    {toggle.id === "learner_photo"
                      ? "Upload a photo on My Profile to include it."
                      : "No data available yet."}
                  </span>
                ) : null}
              </span>
            </span>
            <Switch
              checked={toggle.enabled}
              disabled={!toggle.available}
              onCheckedChange={(checked) => onToggle(toggle.id, checked)}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-[#64748b]">Expiration</span>
        <Select value={String(expiresInDays)} onValueChange={(value) => onExpiresChange(Number(value))}>
          <SelectTrigger className="h-8 w-[120px] rounded-lg border-[#e2e8f0] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
        <p className="text-[11px] font-medium text-[#64748b]">Shareable link preview</p>
        <p className="mt-1 break-all font-mono text-[11px] text-[#023E8A]">
          {shareUrl ?? (tokenHint ? `Active share · hint ${tokenHint}` : "Generate a link to preview it here.")}
        </p>
        {expiresAt ? (
          <p className="mt-1 text-[11px] text-[#94a3b8]">Expires {formatWhen(expiresAt)}</p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGenerate} disabled={submitting}>
          <Link2 className="mr-1.5 h-4 w-4" />
          Share with recruiters on SIJIL
        </Button>
        {shareUrl || shareToken || shareId ? (
          <ShareExportActions publicUrl={shareUrl} shareToken={shareToken} shareId={shareId} />
        ) : null}
      </div>

      {activeShare ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-[#64748b]"
          onClick={() => onRevoke(activeShare.id)}
          disabled={submitting}
        >
          Revoke active link
        </Button>
      ) : null}
    </div>
  );
}

export function WalletEmptyState({ onGoTask, onGoIntegrations }: { onGoTask: () => void; onGoIntegrations: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center px-6 py-14 text-center">
      <p className="text-lg font-semibold text-[#0f172a]">No competency package yet</p>
      <p className="mt-2 max-w-md text-sm text-[#64748b]">
        Declare a competency, connect GitHub or Moodle, and submit a practical task to build a shareable wallet package.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoIntegrations}>
          Connect sources
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={onGoTask}>
          Start practical task
        </Button>
      </div>
    </div>
  );
}

export function WalletRefreshBar({
  onRefresh,
  loading,
}: {
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <Link to="/learner/profile" className="text-xs font-medium text-[#023E8A] hover:underline">
        Back to dashboard
      </Link>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}

export function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

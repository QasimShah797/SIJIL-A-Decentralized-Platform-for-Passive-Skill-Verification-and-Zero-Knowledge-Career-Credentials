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
import type { WalletShareFieldId } from "@/lib/wallet-competency-shared";
import type { WalletShareRecordView } from "@/services/api/wallet.api";

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
  commits: number;
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
}: {
  competencyName: string;
  records: WalletCompetencyRecordView[];
  selectedId: string;
  onSelect: (competencyId: string) => void;
  statusLabel: string;
  verified: boolean;
  lastSync: string | null;
}) {
  const recent = lastSync
    ? Date.now() - new Date(lastSync).getTime() < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="learner-stat-card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-[#023E8A]">SIJIL Wallet</p>
        <span className="hidden h-4 w-px bg-[#e2e8f0] sm:block" />
        {records.length > 1 ? (
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger className="h-9 w-[240px] rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder={competencyName} />
            </SelectTrigger>
            <SelectContent>
              {records.map((record) => (
                <SelectItem key={record.competencyId} value={record.competencyId}>
                  {record.competencyName}
                </SelectItem>
              ))}
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
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
          recent ? "bg-[#ecfdf5] text-[#059669]" : "bg-[#f8fafc] text-[#64748b]",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", recent ? "bg-[#22c55e]" : "bg-[#94a3b8]")} />
        Network sync · {formatRelative(lastSync)}
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
      <p className="text-sm font-semibold text-[#023E8A]">Verified Data Sources</p>
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

export function CompetencyPackageCard({
  competencyName,
  github,
  lmsRows,
  taskLabel,
}: {
  competencyName: string;
  github: GithubPackageStats;
  lmsRows: LmsCourseRow[];
  taskLabel: string | null;
}) {
  const githubOpen = github.repos > 0 || github.activities > 0;
  const lmsOpen = lmsRows.length > 0;
  const hasVerifiedEvidence = githubOpen || lmsOpen || Boolean(taskLabel);

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Evidence Profile</p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        Unified package anchored to {competencyName} source evidence.
      </p>

      {!hasVerifiedEvidence ? (
        <p className="mt-4 text-xs text-[#94a3b8]">No verified GitHub, LMS, or practical-task evidence is linked yet.</p>
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
                <p className="text-lg font-semibold text-[#023E8A]">{github.commits}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#94a3b8]">Activities</p>
                <p className="text-lg font-semibold text-[#023E8A]">{github.activities}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#94a3b8]">Pull requests</p>
                <p className="text-lg font-semibold text-[#023E8A]">{github.pullRequests}</p>
              </div>
            </div>
            {github.languages.length > 0 ? (
              <p className="mt-2 text-xs text-[#64748b]">Languages · {github.languages.join(", ")}</p>
            ) : null}
            {github.commitSeries.length > 0 ? <CommitActivityChart points={github.commitSeries} /> : null}
          </details>
        ) : null}

        {lmsOpen ? (
          <details className="rounded-xl border border-[#e2e8f0] p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[#023E8A]" />
                <span className="text-sm font-semibold text-[#0f172a]">Moodle / LMS</span>
                <span className="learner-tag-linked">Verified</span>
              </div>
              <ChevronDown className="h-4 w-4 text-[#94a3b8]" />
            </summary>
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
                        <span className="tabular-nums text-[#023E8A]">{row.scoreLabel}</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e2e8f0]">
                          <div
                            className="h-full rounded-full bg-[#14b8a6]"
                            style={{ width: `${Math.max(0, Math.min(100, row.scorePercent ?? 0))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}

        {taskLabel ? (
          <div className="flex items-center justify-between rounded-xl border border-[#e2e8f0] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#023E8A]" />
              <span className="text-sm font-medium text-[#0f172a]">Practical task</span>
            </div>
            <span className="text-xs font-semibold text-[#023E8A]">{taskLabel}</span>
          </div>
        ) : null}
      </div>
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

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {source === "github" && (githubRepos.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">No GitHub repositories are linked to this competency.</p>
        ) : githubRepos.map((repo) => (
          <a
            key={repo.name}
            href={repo.url ?? undefined}
            target={repo.url ? "_blank" : undefined}
            rel="noreferrer"
            className="block rounded-lg border border-[#e2e8f0] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-[#0f172a]">{repo.name}</p>
              <TrustTierBadge trustTier="corroborating" trustTierLabel="Corroborating" />
            </div>
            <p className="text-[11px] text-[#64748b]">
              {[repo.language, repo.commits != null ? `${repo.commits} commits` : null].filter(Boolean).join(" · ")}
            </p>
          </a>
        )))}

        {source === "lms" && (lmsAssignments.length === 0 ? (
          <p className="text-xs text-[#94a3b8]">No Moodle assignments are linked to this competency.</p>
        ) : lmsAssignments.map((item) => (
          <div key={`${item.course}-${item.name}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[#0f172a]">{item.name}</p>
              <TrustTierBadge trustTier="lms_preverified" trustTierLabel="LMS pre-verified" />
            </div>
            <p className="text-[11px] text-[#64748b]">{item.course} · {item.grade}</p>
          </div>
        )))}

        {source === "task" && (
          <div className="rounded-lg border border-[#e2e8f0] px-3 py-2">
            <div className="mb-2">
              <TrustTierBadge trustTier="corroborating" trustTierLabel="Corroborating" />
            </div>
            <p className="text-sm text-[#334155]">{taskDetail ?? "No practical task result is stored yet."}</p>
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
  shareScope: "all" | "selected";
  onShareScopeChange: (scope: "all" | "selected") => void;
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

      <div className="mt-4 grid grid-cols-2 gap-2">
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

import { Eye, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectContributor } from "@/lib/sijil-data";
import type { ContributorRow } from "@/lib/db/peer-review-page";
import type { ContributorViewFilter, CoverageStats } from "@/lib/peer-review-insights";
import { contributorStory, groupContributorRows } from "@/lib/peer-review-insights";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function ContributorRowView({
  row,
  learnerGithub,
  sending,
  onViewReview,
  onResend,
  onInvite,
}: {
  row: ContributorRow;
  learnerGithub: string | null;
  sending: boolean;
  onViewReview: (reviewId: string) => void;
  onResend: (contributor: ProjectContributor) => void;
  onInvite: (contributor: ProjectContributor) => void;
}) {
  const contributor = row.contributor;
  const story = contributorStory(row);
  const displayHandle =
    contributor.handle
    && contributor.handle.replace("@", "").toLowerCase()
      !== learnerGithub?.replace("@", "").toLowerCase()
      ? contributor.handle.replace(/^@/, "")
      : null;

  const runAction = () => {
    if (story.action === "view" && row.reviewId) onViewReview(row.reviewId);
    if (story.action === "resend") onResend(contributor);
    if (story.action === "invite") onInvite(contributor);
  };

  return (
    <div
      className={cn(
        "pr-contributor-row grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(140px,0.8fr)_auto] sm:items-center",
        story.stale && "bg-[#fffbeb]",
        story.group === "done" && "bg-white",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {contributor.avatarUrl ? (
          <img src={contributor.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8eef7] text-xs font-bold text-[#023E8A]">
            {initials(contributor.name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-[#0f172a]">{contributor.name}</p>
          <p className="mt-0.5 truncate text-xs text-[#64748b]">
            {displayHandle ? `@${displayHandle}` : contributor.role}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p
          className={cn(
            "text-sm font-semibold",
            story.group === "done" && "text-[#059669]",
            story.group === "action" && "text-[#023E8A]",
            story.group === "waiting" && "text-[#CA8A04]",
            story.group === "skip" && "text-[#94a3b8]",
          )}
        >
          {story.label}
        </p>
        {story.hint ? (
          <p className="mt-0.5 text-[11px] text-[#64748b]">{story.hint}</p>
        ) : null}
      </div>

      <div className="flex justify-start sm:justify-end">
        {story.action === "none" ? (
          <span className="text-xs text-[#94a3b8]">—</span>
        ) : (
          <Button
            size="sm"
            variant={story.action === "invite" || story.stale ? "default" : "outline"}
            className={cn(
              "h-8 rounded-lg text-xs",
              story.action === "invite" || story.stale
                ? "bg-[#023E8A] hover:bg-[#012A5C]"
                : "border-[#e2e8f0]",
            )}
            disabled={sending}
            onClick={runAction}
          >
            {story.action === "view" && <Eye className="mr-1 h-3 w-3" />}
            {story.action === "resend" && <RefreshCw className="mr-1 h-3 w-3" />}
            {story.action === "invite" && <Mail className="mr-1 h-3 w-3" />}
            {sending
              ? "Sending…"
              : story.action === "view"
                ? "Read review"
                : story.action === "resend"
                  ? (story.stale ? "Resend now" : "Remind")
                  : "Invite"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function PeerReviewContributorsBoard({
  rows,
  visibleRows,
  coverage,
  filter,
  onFilter,
  learnerGithub,
  sendingId,
  onViewReview,
  onResend,
  onInvite,
}: {
  rows: ContributorRow[];
  visibleRows: ContributorRow[];
  coverage: CoverageStats;
  filter: ContributorViewFilter;
  onFilter: (value: ContributorViewFilter) => void;
  learnerGithub: string | null;
  sendingId: string | null;
  onViewReview: (reviewId: string) => void;
  onResend: (contributor: ProjectContributor) => void;
  onInvite: (contributor: ProjectContributor) => void;
}) {
  const sourceRows = filter === "all"
    ? rows.filter((row) => contributorStory(row).group !== "skip")
    : visibleRows;
  const grouped = groupContributorRows(sourceRows);
  const eligible = Math.max(1, coverage.total - coverage.ineligible);
  const reviewedPct = Math.round((coverage.reviewed / eligible) * 100);
  const waitingPct = Math.round((coverage.invited / eligible) * 100);
  const pendingPct = Math.max(0, 100 - reviewedPct - waitingPct);

  const sections: { key: "action" | "waiting" | "done" | "skip"; title: string }[] = [
    { key: "action", title: "Needs you" },
    { key: "waiting", title: "Waiting" },
    { key: "done", title: "Reviewed" },
  ];

  if (filter === "all" && groupContributorRows(rows).skip.length > 0) {
    sections.push({ key: "skip", title: "Not eligible" });
    grouped.skip = groupContributorRows(rows).skip;
  }

  return (
    <div id="peer-contributors" className="learner-stat-card overflow-hidden">
      <div className="border-b border-[#e2e8f0] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#023E8A]">Contributors</p>
          </div>
          <p className="rounded-full bg-[#e8eef7] px-3 py-1 text-xs font-semibold text-[#023E8A]">
            {coverage.reviewed} of {eligible} reviewed
          </p>
        </div>

        <div className="mt-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div className="bg-[#059669] transition-all" style={{ width: `${reviewedPct}%` }} title="Reviewed" />
            <div className="bg-[#f59e0b] transition-all" style={{ width: `${waitingPct}%` }} title="Waiting" />
            <div className="bg-[#023E8A] transition-all" style={{ width: `${pendingPct}%` }} title="Needs invite" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              { id: "pending" as const, label: "Needs invite", count: coverage.pending, color: "#023E8A" },
              { id: "invited" as const, label: "Waiting", count: coverage.invited, color: "#d97706" },
              { id: "reviewed" as const, label: "Reviewed", count: coverage.reviewed, color: "#059669" },
            ]).map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => onFilter(filter === step.id ? "all" : step.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  filter === step.id ? "border-[#023E8A] bg-[#eff6ff]" : "border-[#e2e8f0] bg-white hover:bg-[#f8fafc]",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{step.label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: step.color }}>{step.count}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#94a3b8]">
          No contributors on this project yet.
        </p>
      ) : visibleRows.length === 0 && filter !== "all" ? (
        <p className="px-5 py-10 text-center text-sm text-[#94a3b8]">
          Nobody in this step.
        </p>
      ) : (
        sections.map((section) => {
          const list = grouped[section.key];
          if (!list.length) return null;
          return (
            <div key={section.key} className="border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between gap-3 bg-[#f8fafc] px-5 py-2">
                <p className="text-xs font-semibold text-[#023E8A]">{section.title}</p>
                <span className="text-xs tabular-nums text-[#94a3b8]">{list.length}</span>
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                {list.map((row) => (
                  <ContributorRowView
                    key={row.contributor.id}
                    row={row}
                    learnerGithub={learnerGithub}
                    sending={sendingId === row.contributor.id}
                    onViewReview={onViewReview}
                    onResend={onResend}
                    onInvite={onInvite}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

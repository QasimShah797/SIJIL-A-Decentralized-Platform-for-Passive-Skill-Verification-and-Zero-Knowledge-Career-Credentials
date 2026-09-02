import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Github,
  GraduationCap,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ContextSource, PeerReview } from "@/lib/sijil-data";
import type { PeerReviewProject } from "@/lib/db/peer-review-page";
import type {
  ContributorViewFilter,
  CoverageStats,
  NextAction,
  ReviewSort,
  TrustFilter,
} from "@/lib/peer-review-insights";
import { PeerReviewCoverageMeter } from "@/components/peer-reviews/PeerReviewsCharts";

export type ReviewFeedFilter = "all" | "imported" | "sijil";

const STATUS_PILL: Record<string, string> = {
  verified: "bg-[#ecfdf5] text-[#059669] border-[#bbf7d0]",
  progress: "bg-[#eff6ff] text-[#023E8A] border-[#bfdbfe]",
  attention: "bg-[#fef9c3] text-[#CA8A04] border-[#fde68a]",
  muted: "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]",
  danger: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
};

export function peerReviewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export function sourceIcon(source: ContextSource) {
  if (source === "GitHub") return <Github className="h-3.5 w-3.5" />;
  if (source === "LMS") return <GraduationCap className="h-3.5 w-3.5" />;
  if (source === "Spark") return <Sparkles className="h-3.5 w-3.5" />;
  return <Users className="h-3.5 w-3.5" />;
}

export function PeerReviewStatusPill({
  children,
  tone = "muted",
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof STATUS_PILL;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        STATUS_PILL[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function PeerReviewsBreadcrumbBar({ didShort }: { didShort?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
        <Link to="/learner/profile" className="hover:text-[#023E8A]">
          Learner
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span>Identity</span>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-semibold text-[#023E8A]">Peer Reviews</span>
      </nav>
      {didShort ? (
        <span className="mono rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[10px] text-[#64748b]">
          {didShort}
        </span>
      ) : null}
    </div>
  );
}

export function PeerReviewsHero({
  onImport,
  importDisabled,
  syncing,
}: {
  onImport: () => void;
  importDisabled: boolean;
  syncing?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Peer Reviews</h1>
        {syncing && <p className="mt-1 text-[11px] text-[#023E8A]">Syncing GitHub…</p>}
      </div>
      <Button
        variant="outline"
        className="rounded-xl border-[#e2e8f0]"
        onClick={onImport}
        disabled={importDisabled}
      >
        <Download className="mr-1.5 h-4 w-4" />
        Import
      </Button>
    </div>
  );
}

export function PeerReviewsStatsGrid({
  total,
  verifiedContext,
  highTrust,
  pending,
  activeTrust,
  onSelectTrust,
  onFocusInvites,
}: {
  total: number;
  verifiedContext: number;
  highTrust: number;
  pending: number;
  activeTrust: TrustFilter;
  onSelectTrust: (trust: TrustFilter) => void;
  onFocusInvites: () => void;
}) {
  const items = [
    {
      id: "total",
      label: "Reviews",
      value: String(total),
      active: false,
      onClick: () => onSelectTrust("all"),
    },
    {
      id: "verified",
      label: "Verified",
      value: String(verifiedContext),
      active: false,
      onClick: () => onSelectTrust("all"),
    },
    {
      id: "high",
      label: "High trust",
      value: String(highTrust),
      active: activeTrust === "high",
      onClick: () => onSelectTrust(activeTrust === "high" ? "all" : "high"),
    },
    {
      id: "pending",
      label: "Pending",
      value: String(pending),
      active: false,
      onClick: onFocusInvites,
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={cn(
            "learner-stat-card pr-stat-card px-4 py-3 text-left transition-shadow hover:shadow-md",
            item.active && "ring-2 ring-[#023E8A]/20",
          )}
        >
          <p className="text-[11px] text-[#64748b]">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-[#023E8A]">{item.value}</p>
        </button>
      ))}
    </div>
  );
}

export function PeerReviewNextAction({
  action,
  busy,
  onInviteRemaining,
  onResendStale,
  onImport,
}: {
  action: NextAction;
  busy?: boolean;
  onInviteRemaining: () => void;
  onResendStale: () => void;
  onImport: () => void;
}) {
  if (action.kind === "healthy") return null;

  const tone =
    action.kind === "resend"
      ? "border-[#fde68a] bg-[#fffbeb]"
      : "border-[#bfdbfe] bg-[#eff6ff]";

  const run =
    action.kind === "invite"
      ? onInviteRemaining
      : action.kind === "resend"
        ? onResendStale
        : onImport;

  return (
    <div className={cn("mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3", tone)}>
      <p className="text-sm font-medium text-[#0f172a]">{action.title}</p>
      <Button
        className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
        onClick={run}
        disabled={busy}
      >
        {busy ? "Working…" : action.kind === "invite" ? "Invite" : action.kind === "resend" ? "Resend" : "Import"}
      </Button>
    </div>
  );
}

export function PeerReviewsEmptySkills({ onGoProfile }: { onGoProfile: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center px-6 py-14 text-center">
      <ShieldCheck className="mb-3 h-9 w-9 text-[#94a3b8]" />
      <p className="font-semibold text-[#0f172a]">No competencies yet</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">
        Add one on My Profile, then come back to request reviews.
      </p>
      <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoProfile}>
        Go to profile
      </Button>
    </div>
  );
}

export function PeerReviewsEmptyProjects({ onGoIntegrations }: { onGoIntegrations: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center px-6 py-14 text-center">
      <Github className="mb-3 h-9 w-9 text-[#94a3b8]" />
      <p className="font-semibold text-[#0f172a]">No linked projects</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">
        Connect GitHub on Integrations, then sync a repository.
      </p>
      <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoIntegrations}>
        Open integrations
      </Button>
    </div>
  );
}

export function PeerReviewProjectToolbar({
  projects,
  selectedProjectId,
  onSelectProject,
  skillValue,
  onSkillChange,
  skillOptions,
  selectedProject,
  coverage,
}: {
  projects: PeerReviewProject[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  skillValue: string;
  onSkillChange: (skill: string) => void;
  skillOptions: string[];
  selectedProject?: PeerReviewProject;
  coverage?: CoverageStats;
}) {
  return (
    <div className="learner-stat-card mb-6 overflow-hidden">
      <div className="border-b border-[#e2e8f0] px-5 py-4">
        <p className="text-sm font-semibold text-[#023E8A]">Project</p>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
            Project
          </label>
          <Select value={selectedProjectId} onValueChange={onSelectProject}>
            <SelectTrigger className="mt-1.5 rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name} · {project.source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
            Skill
          </label>
          <Select value={skillValue} onValueChange={onSkillChange}>
            <SelectTrigger className="mt-1.5 rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder="Select a skill" />
            </SelectTrigger>
            <SelectContent>
              {skillOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selectedProject && (
        <div className="flex flex-col gap-3 border-t border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <PeerReviewStatusPill tone="progress" icon={sourceIcon(selectedProject.source)}>
              {selectedProject.source}
            </PeerReviewStatusPill>
            <span className="text-sm font-medium text-[#0f172a]">{selectedProject.name}</span>
            <span className="text-xs text-[#94a3b8]">{selectedProject.evidenceLabel}</span>
            {selectedProject.url && (
              <a
                className="inline-flex items-center gap-1 text-xs font-medium text-[#023E8A] hover:underline"
                href={selectedProject.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {coverage && <PeerReviewCoverageMeter coverage={coverage} />}
        </div>
      )}
    </div>
  );
}

export function ReviewFeedTabs({
  value,
  onChange,
  counts,
}: {
  value: ReviewFeedFilter;
  onChange: (value: ReviewFeedFilter) => void;
  counts: { all: number; imported: number; sijil: number };
}) {
  const tabs: { id: ReviewFeedFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "imported", label: "Imported", count: counts.imported },
    { id: "sijil", label: "SIJIL", count: counts.sijil },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f5f9] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === tab.id ? "bg-[#0f172a] text-white" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          {tab.label}
          <span className={cn("ml-1.5 tabular-nums", value === tab.id ? "text-white/70" : "text-[#94a3b8]")}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ContributorViewTabs({
  value,
  onChange,
  counts,
}: {
  value: ContributorViewFilter;
  onChange: (value: ContributorViewFilter) => void;
  counts: { all: number; reviewed: number; invited: number; pending: number };
}) {
  const tabs: { id: ContributorViewFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "pending", label: "Need invite", count: counts.pending },
    { id: "invited", label: "Invited", count: counts.invited },
    { id: "reviewed", label: "Reviewed", count: counts.reviewed },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f5f9] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === tab.id ? "bg-[#0f172a] text-white" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          {tab.label}
          <span className={cn("ml-1.5 tabular-nums", value === tab.id ? "text-white/70" : "text-[#94a3b8]")}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ReviewFeedToolbar({
  search,
  onSearch,
  sort,
  onSort,
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: ReviewSort;
  onSort: (value: ReviewSort) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search reviews"
          className="h-9 rounded-xl border-[#e2e8f0] pl-9 text-sm"
        />
      </div>
      <Select value={sort} onValueChange={(value) => onSort(value as ReviewSort)}>
        <SelectTrigger className="h-9 w-[140px] rounded-xl border-[#e2e8f0] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
          <SelectItem value="trust">Highest trust</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function trustTone(weight: PeerReview["trustWeight"]): keyof typeof STATUS_PILL {
  if (weight === "High Trust") return "verified";
  if (weight === "Medium Trust") return "progress";
  if (weight === "Blocked") return "danger";
  return "muted";
}

export function PeerReviewCard({
  r,
  defaultOpen = false,
}: {
  r: PeerReview & Record<string, unknown>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const reviewerName = r.reviewerName ?? (typeof r.reviewer_name === "string" ? r.reviewer_name : "Reviewer");
  const comment = r.comment ?? (typeof r.review_text === "string" ? r.review_text : "");
  const reviewDate = r.date ?? (typeof r.created_at === "string" ? r.created_at : new Date().toISOString());
  const reviewSource = (r.source ?? "GitHub") as ContextSource;
  const repositoryName = typeof r.repository_name === "string"
    ? r.repository_name
    : (r.projectName || "");
  const skillLabel = r.skill || "";
  const pullRequestNumber = typeof r.pull_request_number === "number" ? r.pull_request_number : null;

  return (
    <article id={`review-${r.id}`} className="scroll-mt-24">
      <button
        type="button"
        onClick={() => comment && setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f8fafc]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eef7] text-[11px] font-bold text-[#023E8A]">
          {peerReviewInitials(String(reviewerName))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#0f172a]">{reviewerName}</p>
          <p className="truncate text-[11px] text-[#64748b]">
            {[skillLabel, repositoryName, pullRequestNumber != null ? `PR #${pullRequestNumber}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="hidden sm:inline-flex">
          <PeerReviewStatusPill tone="progress" icon={sourceIcon(reviewSource)}>
            {reviewSource}
          </PeerReviewStatusPill>
        </span>
        <PeerReviewStatusPill tone={trustTone(r.trustWeight)}>
          {r.trustWeight === "High Trust" ? "High" : r.trustWeight === "Medium Trust" ? "Medium" : r.trustWeight ?? "—"}
        </PeerReviewStatusPill>
        <time className="hidden shrink-0 text-[11px] text-[#94a3b8] md:block">
          {new Date(reviewDate).toLocaleDateString()}
        </time>
        {comment ? (
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#94a3b8] transition-transform", open && "rotate-180")} />
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
      </button>
      {open && comment && (
        <p className="border-t border-[#f1f5f9] bg-[#f8fafc] px-4 py-3 text-sm leading-relaxed text-[#334155] whitespace-pre-line">
          {comment}
        </p>
      )}
    </article>
  );
}

export function PeerReviewFeed({
  reviews,
  emptyTitle,
  emptyDescription,
  header,
  focusId,
}: {
  reviews: Array<PeerReview & Record<string, unknown>>;
  emptyTitle: string;
  emptyDescription: string;
  header?: ReactNode;
  focusId?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (focusId && reviews.some((review) => review.id === focusId)) {
      setShowAll(true);
    }
  }, [focusId, reviews]);

  const visible = showAll || reviews.length <= 6 ? reviews : reviews.slice(0, 6);

  return (
    <div id="peer-reviews" className="learner-stat-card overflow-hidden">
      {header}
      {reviews.length === 0 ? (
        <PeerReviewsEmptyFeed title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div className="divide-y divide-[#f1f5f9]">
            {visible.map((review) => (
              <PeerReviewCard key={review.id} r={review} defaultOpen={review.id === focusId} />
            ))}
          </div>
          {reviews.length > 6 && (
            <button
              type="button"
              className="w-full border-t border-[#e2e8f0] py-2.5 text-xs font-medium text-[#023E8A] hover:bg-[#f8fafc]"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show less" : `Show all ${reviews.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function PeerReviewsEmptyFeed({
  title = "No peer reviews yet",
  description = "Invite verified project contributors to submit a context-verified review.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <MessageSquare className="mb-3 h-8 w-8 text-[#94a3b8]" />
      <p className="font-semibold text-[#0f172a]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">{description}</p>
    </div>
  );
}

export function PeerReviewsFooter() {
  return (
    <footer className="mt-10 border-t border-[#e2e8f0] pt-6 text-center text-xs text-[#94a3b8]">
      SIJIL · Learner identity workspace
    </footer>
  );
}

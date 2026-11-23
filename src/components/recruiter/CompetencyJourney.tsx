import {
  Award,
  BadgeCheck,
  ClipboardCheck,
  ExternalLink,
  GitBranch,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { formatTimestamp } from "@/components/zkp/policy-outcome";
import {
  buildSkillJourneyTimeline,
  summarizeSkillJourney,
  type JourneyMilestone,
  type JourneyMilestoneKind,
  type JourneyVerification,
} from "@/lib/recruiter-journey";
import type { SharedCompetencyVersion } from "@/services/api/recruiter-workspace.api";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  JourneyMilestoneKind,
  { label: string; icon: typeof Award; tone: string }
> = {
  credential: {
    label: "Credential",
    icon: BadgeCheck,
    tone: "bg-[#ecfdf5] text-[#059669]",
  },
  version: {
    label: "Progress",
    icon: GitBranch,
    tone: "bg-[#e8eef7] text-[#023E8A]",
  },
  assessment: {
    label: "Assessment",
    icon: ClipboardCheck,
    tone: "bg-[#ecfeff] text-[#0891b2]",
  },
  achievement: {
    label: "Achievement",
    icon: Award,
    tone: "bg-[#fef9c3] text-[#ca8a04]",
  },
  integration: {
    label: "Integration",
    icon: Link2,
    tone: "bg-[#f1f5f9] text-[#475569]",
  },
};

function verificationTone(status: JourneyVerification): string {
  if (status === "Verified") return "bg-[#ecfdf5] text-[#059669] border-[#bbf7d0]";
  if (status === "Shared") return "bg-[#e8eef7] text-[#023E8A] border-[#c5d4eb]";
  if (status === "Pending") return "bg-[#fef9c3] text-[#ca8a04] border-[#fde68a]";
  return "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]";
}

function formatJourneyWhen(value: string): { date: string; time: string } {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return { date: "—", time: "" };
  const stamp = new Date(parsed);
  return {
    date: stamp.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: stamp.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function CompetencyJourney({
  skill,
  credentials,
  recordedVersions = [],
  disclosedPayload = null,
  sharedAt = null,
}: {
  skill: string;
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>;
  recordedVersions?: SharedCompetencyVersion[];
  disclosedPayload?: Record<string, unknown> | null;
  sharedAt?: string | null;
}) {
  const milestones = buildSkillJourneyTimeline({
    skill,
    credentials,
    recordedVersions,
    disclosedPayload,
    sharedAt,
  });
  const summary = summarizeSkillJourney(milestones);

  return (
    <section className="learner-stat-card overflow-hidden" aria-labelledby="skill-journey-heading">
      <div className="border-b border-[#e2e8f0] px-5 py-4">
        <h2 id="skill-journey-heading" className="text-base font-semibold text-[#023E8A]">
          Longitudinal Journey
        </h2>
        <p className="mt-1 text-xs text-[#64748b]">
          Timeline for <span className="font-medium text-[#023E8A]">{skill}</span> —
          repos, commits, practical tasks, and credentials with date and time.
        </p>
        {milestones.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#e8eef7] px-2.5 py-1 text-[11px] font-semibold text-[#023E8A]">
              {summary.milestoneCount} steps
            </span>
            {summary.attemptCount > 0 ? (
              <span className="rounded-full bg-[#ecfeff] px-2.5 py-1 text-[11px] font-semibold text-[#0891b2]">
                {summary.attemptCount} {summary.attemptCount === 1 ? "attempt" : "attempts"}
              </span>
            ) : null}
            {summary.bestScoreLabel ? (
              <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold text-[#059669]">
                Latest score {summary.bestScoreLabel}
              </span>
            ) : null}
            {summary.firstDate && summary.lastDate ? (
              <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-medium text-[#64748b]">
                {formatJourneyWhen(summary.firstDate).date}
                {summary.firstDate !== summary.lastDate
                  ? ` → ${formatJourneyWhen(summary.lastDate).date}`
                  : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {milestones.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <ShieldCheck className="mb-3 h-8 w-8 text-[#94a3b8]" />
          <p className="font-semibold text-[#0f172a]">No longitudinal journey yet</p>
          <p className="mt-1 max-w-sm text-sm text-[#64748b]">
            Repo activity, practical tasks, and shared credentials appear here once disclosed.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-0 px-5 py-5">
          <div
            className="absolute bottom-8 left-[2.15rem] top-8 w-px bg-[#c5d4eb]"
            aria-hidden
          />
          {milestones.map((milestone, index) => (
            <JourneyTimelineItem
              key={milestone.id}
              milestone={milestone}
              isLast={index === milestones.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function JourneyTimelineItem({
  milestone,
  isLast,
}: {
  milestone: JourneyMilestone;
  isLast: boolean;
}) {
  const meta = KIND_META[milestone.kind];
  const Icon = meta.icon;
  const when = formatJourneyWhen(milestone.date);

  return (
    <li className={cn("relative flex gap-4", !isLast && "pb-5")}>
      <span
        className={cn(
          "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
          meta.tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <article className="min-w-0 flex-1 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#023E8A]">{milestone.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">{milestone.detail}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              verificationTone(milestone.verification),
            )}
          >
            {milestone.verification}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.tone)}>
            {meta.label}
          </span>
          {milestone.attemptNumber != null && milestone.attemptTotal != null ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#0891b2] ring-1 ring-[#cffafe]">
              Attempt {milestone.attemptNumber}/{milestone.attemptTotal}
            </span>
          ) : null}
          {milestone.scoreLabel ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#059669] ring-1 ring-[#bbf7d0]">
              Score {milestone.scoreLabel}
            </span>
          ) : null}
          {milestone.outcome && milestone.kind === "assessment" ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#64748b] ring-1 ring-[#e2e8f0]">
              {milestone.outcome}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#e2e8f0] pt-2.5">
          <time dateTime={milestone.date} className="text-xs font-semibold text-[#023E8A]">
            {when.date}
          </time>
          {when.time ? (
            <span className="text-[11px] text-[#64748b]">{when.time}</span>
          ) : null}
          <span className="text-[10px] text-[#94a3b8]" title={formatTimestamp(milestone.date)}>
            local time
          </span>
          {milestone.url ? (
            <a
              href={milestone.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#023E8A] hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              Open link
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </article>
    </li>
  );
}

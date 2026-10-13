import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  GitCompare,
  Mail,
  UserCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import { recruiterProfileCompletenessPercent } from "@/components/recruiter/RecruiterProfilePanels";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { recruiterVerificationLabel } from "@/lib/db/recruiter-profile";
import type { CandidateView } from "@/lib/db/candidates";
import { getEvidenceStats } from "@/lib/recruiter-evidence";
import {
  INTERVIEW_MODE_LABELS,
  formatInterviewDateTime,
  type ScheduledInterviewView,
} from "@/lib/interview";
import { daysSince } from "@/lib/sijil-data";
import { cn } from "@/lib/utils";

const SHORTLIST_KEY = "sijil.recruiterShortlist";

export function readRecruiterShortlist(): string[] {
  try {
    const raw = localStorage.getItem(SHORTLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecruiterShortlist(ids: string[]) {
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify(ids));
}

export function relativeShareTime(iso: string | null | undefined) {
  if (!iso) return "Recent";
  const days = daysSince(iso);
  if (days == null || Number.isNaN(days)) return "Recent";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function isUpcomingInterview(row: ScheduledInterviewView) {
  return row.status === "scheduled" && new Date(row.scheduledAt).getTime() >= Date.now() - 60_000;
}

function evidenceCount(candidate: CandidateView) {
  return getEvidenceStats(candidate).evidenceTotal || candidate.evidence || 0;
}

export function pipelineBuckets(candidates: CandidateView[], interviews: ScheduledInterviewView[]) {
  const scheduledIds = new Set(
    interviews.filter(isUpcomingInterview).map((row) => row.candidateUserId),
  );
  let scheduled = 0;
  let verified = 0;
  let open = 0;
  for (const candidate of candidates) {
    if (scheduledIds.has(candidate.id)) scheduled += 1;
    else if (candidate.attestation === "Approved") verified += 1;
    else open += 1;
  }
  return { scheduled, verified, open };
}

function PipelineDonut({
  verified,
  scheduled,
  open,
}: {
  verified: number;
  scheduled: number;
  open: number;
}) {
  const total = Math.max(verified + scheduled + open, 1);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const verifiedLen = (verified / total) * circumference;
  const scheduledLen = (scheduled / total) * circumference;
  const openLen = (open / total) * circumference;

  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="14" stroke="#e2e8f0" />
        {open > 0 && (
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="14"
            stroke="#cbd5e1"
            strokeDasharray={`${openLen} ${circumference}`}
            strokeDashoffset={-(verifiedLen + scheduledLen)}
          />
        )}
        {scheduled > 0 && (
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="14"
            stroke="#023E8A"
            strokeDasharray={`${scheduledLen} ${circumference}`}
            strokeDashoffset={-verifiedLen}
          />
        )}
        {verified > 0 && (
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="14"
            stroke="#14b8a6"
            strokeDasharray={`${verifiedLen} ${circumference}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#023E8A]">{verified + scheduled + open}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#64748b]">Directory</span>
      </div>
    </div>
  );
}

export function RecruiterPipelineCard({
  candidates,
  interviews,
}: {
  candidates: CandidateView[];
  interviews: ScheduledInterviewView[];
}) {
  const buckets = pipelineBuckets(candidates, interviews);
  const rows = [
    { label: "Verified shares", count: buckets.verified, color: "bg-[#14b8a6]" },
    { label: "Interview scheduled", count: buckets.scheduled, color: "bg-[#023E8A]" },
    { label: "Not reviewed", count: buckets.open, color: "bg-[#cbd5e1]" },
  ];

  return (
    <div className="learner-stat-card p-6">
      <h2 className="text-base font-semibold text-[#023E8A]">Hiring pipeline</h2>
      <p className="text-xs text-[#64748b]">Verified shares · Interview scheduled · Not reviewed</p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <PipelineDonut {...buckets} />
        <ul className="w-full space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", row.color)} />
              <span className="text-[#334155]">{row.label}</span>
              <span className="ml-auto font-semibold text-[#023E8A]">{row.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RecruiterShortlistCard({
  candidates,
  selectedIds,
  onRemove,
  onOpen,
  onCompare,
}: {
  candidates: CandidateView[];
  selectedIds: string[];
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  onCompare: () => void;
}) {
  const selected = selectedIds
    .map((id) => candidates.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is CandidateView => Boolean(candidate));
  const peak = Math.max(1, ...candidates.map(evidenceCount));

  return (
    <div className="learner-stat-card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[#023E8A]">Shortlist</h2>
        {selected.length >= 2 ? (
          <button type="button" onClick={onCompare} className="text-xs font-medium text-[#023E8A] hover:underline">
            Compare
          </button>
        ) : null}
      </div>
      <ul className="mt-4 space-y-4">
        {selected.length === 0 ? (
          <li className="py-6 text-center text-sm text-[#64748b]">
            Select candidates below to keep a shortlist on this browser.
          </li>
        ) : (
          selected.map((candidate) => {
            const count = evidenceCount(candidate);
            const percent = Math.round((count / peak) * 100);
            return (
              <li key={candidate.id} className="flex items-start gap-3">
                <button type="button" onClick={() => onOpen(candidate.id)} className="shrink-0">
                  <CandidateAvatar name={candidate.name} avatarUrl={candidate.avatarUrl} className="h-11 w-11" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onOpen(candidate.id)} className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold text-[#023E8A]">{candidate.name}</p>
                      <p className="truncate text-xs text-[#64748b]">{candidate.institution}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(candidate.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9]"
                      aria-label={`Remove ${candidate.name} from shortlist`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
                      <div className="h-full rounded-full bg-[#14b8a6]" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-[#64748b]">{count} evidence</span>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function RecruiterUpcomingInterviews({
  interviews,
  onOpen,
}: {
  interviews: ScheduledInterviewView[];
  onOpen: (candidateId: string) => void;
}) {
  const upcoming = interviews.filter(isUpcomingInterview).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const emailPending = interviews.filter((row) => row.status === "scheduled" && row.emailStatus !== "sent").length;
  const visible = upcoming.slice(0, 3);

  return (
    <div className="learner-stat-card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[#023E8A]">Upcoming interviews</h2>
        <Link to="/recruiter/interviews" className="text-xs font-medium text-[#023E8A] hover:underline">
          View all
        </Link>
      </div>
      {emailPending > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#fff7ed] px-2.5 py-1 text-xs font-medium text-[#c2410c]">
          <Mail className="h-3.5 w-3.5" />
          {emailPending} invitation{emailPending === 1 ? "" : "s"} not emailed yet
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {visible.length === 0 ? (
          <li className="text-sm text-[#64748b]">No upcoming interviews.</li>
        ) : (
          visible.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(row.candidateUserId)}
                className="flex w-full items-center gap-3 rounded-xl text-left hover:bg-[#f8fafc]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9]">
                  <CalendarClock className="h-4 w-4 text-[#023E8A]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#023E8A]">{row.candidateName}</p>
                  <p className="text-xs text-[#64748b]">
                    {formatInterviewDateTime(row.scheduledAt)} · {INTERVIEW_MODE_LABELS[row.mode]}
                  </p>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function RecruiterRecentlyShared({
  candidates,
  onOpen,
}: {
  candidates: CandidateView[];
  onOpen: (id: string) => void;
}) {
  const recent = [...candidates]
    .sort((a, b) => (b.sharedAt ?? "").localeCompare(a.sharedAt ?? ""))
    .slice(0, 4);

  return (
    <div className="learner-stat-card p-6">
      <h2 className="text-base font-semibold text-[#023E8A]">Recently shared</h2>
      <ul className="mt-4 space-y-3">
        {recent.length === 0 ? (
          <li className="text-sm text-[#64748b]">No shared credentials yet.</li>
        ) : (
          recent.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => onOpen(candidate.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <CandidateAvatar name={candidate.name} avatarUrl={candidate.avatarUrl} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#023E8A]">{candidate.name}</p>
                  <p className="truncate text-xs text-[#64748b]">
                    {candidate.topSkill !== "—" ? candidate.topSkill : "Shared profile"}
                    {candidate.institution && candidate.institution !== "—" ? ` · ${candidate.institution}` : ""}
                  </p>
                </div>
                <span className="learner-tag-linked">Shared</span>
                <span className="shrink-0 text-[10px] text-[#64748b]">{relativeShareTime(candidate.sharedAt)}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type ActivityItem = { id: string; label: string; at: string };

export function recruiterActivityItems(
  candidates: CandidateView[],
  interviews: ScheduledInterviewView[],
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const row of interviews) {
    if (row.status === "cancelled" && row.cancelledAt) {
      items.push({
        id: `cancel-${row.id}`,
        label: `Interview with ${row.candidateName} cancelled`,
        at: row.cancelledAt,
      });
      continue;
    }
    items.push({
      id: `interview-${row.id}`,
      label:
        row.emailStatus === "sent"
          ? `Invitation emailed to ${row.candidateName}`
          : `Interview scheduled with ${row.candidateName}`,
      at: row.createdAt || row.scheduledAt,
    });
  }
  for (const candidate of candidates) {
    if (!candidate.sharedAt) continue;
    items.push({
      id: `share-${candidate.id}`,
      label: `${candidate.name} shared credentials`,
      at: candidate.sharedAt,
    });
  }
  return items
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
}

export function RecruiterRecentActivity({
  candidates,
  interviews,
}: {
  candidates: CandidateView[];
  interviews: ScheduledInterviewView[];
}) {
  const items = recruiterActivityItems(candidates, interviews);

  return (
    <div className="learner-stat-card p-6">
      <h2 className="text-base font-semibold text-[#023E8A]">Recent activity</h2>
      <ul className="mt-4 space-y-3">
        {items.length === 0 ? (
          <li className="text-sm text-[#64748b]">No recent activity.</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ccfbf1]">
                <BadgeCheck className="h-3 w-3 text-[#0f766e]" />
              </div>
              <div>
                <p className="text-sm text-[#023E8A]">{item.label}</p>
                <p className="text-xs text-[#64748b]">{relativeShareTime(item.at)}</p>
              </div>
            </li>
          ))
        )}
      </ul>
      <Link
        to="/recruiter/interviews"
        className="mt-4 inline-flex items-center text-xs font-medium text-[#023E8A] hover:underline"
      >
        View all interviews
        <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function RecruiterDashboardRail({
  selectedCount,
  onCompare,
}: {
  selectedCount: number;
  onCompare: () => void;
}) {
  const navigate = useNavigate();
  const { profile } = useRecruiterProfile();
  const completion = profile ? recruiterProfileCompletenessPercent(profile) : 0;
  const verified = profile
    ? profile.verificationStatus === "verified" || profile.verificationStatus === "company_domain_verified"
    : false;

  const actions = [
    {
      label: "View interviews",
      sub: "Upcoming and cancelled",
      icon: CalendarClock,
      onClick: () => navigate("/recruiter/interviews"),
    },
    {
      label: "Compare candidates",
      sub: selectedCount >= 2 ? `${selectedCount} selected` : "Select at least 2",
      icon: GitCompare,
      onClick: onCompare,
    },
    {
      label: "Edit profile",
      sub: "Company and hiring focus",
      icon: UserCircle,
      onClick: () => navigate("/recruiter/profile"),
    },
  ];

  return (
    <>
      <div className="learner-stat-card p-5">
        <h3 className="text-sm font-semibold text-[#023E8A]">Quick actions</h3>
        <div className="mt-4 space-y-2">
          {actions.map(({ label, sub, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex w-full items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3 text-left transition-colors hover:border-[#023E8A]/30"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#023E8A]">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#023E8A]">{label}</p>
                <p className="text-[11px] text-[#64748b]">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="learner-stat-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#023E8A]">My Profile</h3>
          <Link to="/recruiter/profile" className="text-xs font-medium text-[#023E8A] hover:underline">
            Edit
          </Link>
        </div>
        {profile ? (
          <>
            <div className="flex items-center gap-3">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#023E8A] text-sm font-semibold text-white">
                  {profile.initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#334155]">{profile.fullName}</p>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    verified ? "bg-[#ccfbf1] text-[#0f766e]" : "bg-[#fff7ed] text-[#c2410c]",
                  )}
                >
                  <BadgeCheck className="h-3 w-3" />
                  {recruiterVerificationLabel(profile.verificationStatus)}
                </span>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-[#64748b]">{profile.workEmail}</p>
            <p className="mt-1 truncate text-xs text-[#64748b]">
              {profile.jobTitle} · {profile.companyName}
            </p>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-[#64748b]">Profile complete</span>
                <span className="font-semibold text-[#023E8A]">{completion}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                <div className="h-full rounded-full bg-[#14b8a6] transition-all" style={{ width: `${completion}%` }} />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#64748b]">Profile details will appear after they load.</p>
        )}
        <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#e2e8f0]">
          <Link to="/recruiter/profile">
            <UserCircle className="mr-2 h-4 w-4" />
            View full profile
          </Link>
        </Button>
      </div>
    </>
  );
}

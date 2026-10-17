import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, CalendarClock, CalendarX, ExternalLink, Mail, MapPin, Phone, Search, Video } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { ConfirmDestructiveDialog } from "@/components/sijil/ConfirmDestructiveDialog";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cancelInterviewApi, listInterviewsApi, resendInterviewEmailApi } from "@/services/api/interview.api";
import { useCandidates } from "@/hooks/useCandidates";
import {
  INTERVIEW_MODE,
  INTERVIEW_MODE_LABELS,
  formatInterviewDateTime,
  formatInterviewDuration,
  type ScheduledInterviewView,
} from "@/lib/interview";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "upcoming", label: "Upcoming", hint: "Still on the calendar", icon: CalendarClock },
  { id: "past", label: "Past", hint: "Already happened", icon: CalendarCheck },
  { id: "cancelled", label: "Cancelled", hint: "Called off", icon: CalendarX },
  { id: "email", label: "Email pending", hint: "Invitation not sent yet", icon: Mail },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type ModeFilter = "all" | ScheduledInterviewView["mode"];
type InterviewPhase = "upcoming" | "past" | "cancelled";

const iconTints = [
  "bg-[#e8eef7] text-[#023E8A]",
  "bg-[#ecfdf5] text-[#059669]",
  "bg-[#fef2f2] text-[#dc2626]",
  "bg-[#fff7ed] text-[#c2410c]",
];

function interviewPhase(row: ScheduledInterviewView): InterviewPhase {
  if (row.status === "cancelled") return "cancelled";
  if (new Date(row.scheduledAt).getTime() < Date.now() - 60_000) return "past";
  return "upcoming";
}

function modeIcon(mode: ScheduledInterviewView["mode"]) {
  if (mode === INTERVIEW_MODE.VIDEO_CALL) return Video;
  if (mode === INTERVIEW_MODE.PHONE) return Phone;
  return MapPin;
}

function meetingHref(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function campusName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name || name === "—") return null;
  return name;
}

export default function RecruiterInterviews() {
  const navigate = useNavigate();
  const { candidates } = useCandidates();
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("upcoming");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [query, setQuery] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const sendEmail = async (interviewId: string) => {
    setBusyId(interviewId);
    try {
      const updated = await resendInterviewEmailApi(interviewId);
      setInterviews((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast({
        title: "Email sent",
        description: `Invitation emailed to ${updated.candidateEmail}.`,
      });
    } catch (err) {
      toast({
        title: "Could not send email",
        description: err instanceof Error ? err.message : "Configure Gmail SMTP in backend/.env first.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const rows = await listInterviewsApi();
      setInterviews(rows);
    } catch (err) {
      setInterviews([]);
      setError(err instanceof Error ? err.message : "Could not load interviews.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campusByCandidate = useMemo(() => {
    const names = new Map<string, string>();
    for (const candidate of candidates) {
      const campus = campusName(candidate.institution);
      if (campus) names.set(candidate.id, campus);
    }
    return names;
  }, [candidates]);

  const counts = useMemo(() => ({
    upcoming: interviews.filter((row) => interviewPhase(row) === "upcoming").length,
    past: interviews.filter((row) => interviewPhase(row) === "past").length,
    cancelled: interviews.filter((row) => interviewPhase(row) === "cancelled").length,
    email: interviews.filter((row) => row.status === "scheduled" && row.emailStatus !== "sent").length,
  }), [interviews]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = interviews.filter((row) => {
      const phase = interviewPhase(row);
      if (filter === "upcoming" && phase !== "upcoming") return false;
      if (filter === "past" && phase !== "past") return false;
      if (filter === "cancelled" && phase !== "cancelled") return false;
      if (filter === "email" && (row.status !== "scheduled" || row.emailStatus === "sent")) return false;
      if (mode !== "all" && row.mode !== mode) return false;
      if (!needle) return true;
      const campus = campusByCandidate.get(row.candidateUserId) ?? "";
      return `${row.candidateName} ${row.candidateEmail} ${row.locationOrLink} ${campus}`.toLowerCase().includes(needle);
    });
    const rank: Record<InterviewPhase, number> = { upcoming: 0, past: 1, cancelled: 2 };
    return rows.sort((left, right) => {
      const phaseOrder = rank[interviewPhase(left)] - rank[interviewPhase(right)];
      if (phaseOrder !== 0) return phaseOrder;
      const direction = interviewPhase(left) === "upcoming" ? 1 : -1;
      return left.scheduledAt.localeCompare(right.scheduledAt) * direction;
    });
  }, [campusByCandidate, filter, interviews, mode, query]);

  const pickerCandidate = candidates.find((candidate) => candidate.id === pickerId) ?? null;
  const sortedCandidates = useMemo(
    () => [...candidates].sort((left, right) => left.name.localeCompare(right.name)),
    [candidates],
  );

  const confirmCancel = async () => {
    if (!cancellingId) return;
    setBusyId(cancellingId);
    try {
      const updated = await cancelInterviewApi(cancellingId);
      setInterviews((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast({
        title: "Interview cancelled",
        description:
          updated.emailStatus === "sent"
            ? `${updated.candidateName} has been emailed about the cancellation.`
            : "The interview is cancelled. The candidate was not emailed because SMTP is not configured.",
        variant: updated.emailStatus === "sent" ? "default" : "destructive",
      });
      setCancellingId(null);
    } catch (err) {
      toast({
        title: "Could not cancel interview",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <AppShell role="recruiter">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  return (
    <AppShell role="recruiter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">Interviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule a conversation with a shared candidate, then track upcoming, past, and cancelled interviews here.
        </p>
      </div>

      <section className="learner-stat-card mb-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#023E8A]">Schedule an interview</h2>
            <p className="mt-1 text-xs text-[#64748b]">Pick a candidate, then send the date, mode, and meeting details.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <Select value={pickerId || undefined} onValueChange={setPickerId} disabled={sortedCandidates.length === 0}>
              <SelectTrigger className="h-10 w-full rounded-xl sm:w-72">
                <SelectValue placeholder={sortedCandidates.length === 0 ? "No shared candidates yet" : "Choose a candidate"} />
              </SelectTrigger>
              <SelectContent>
                {sortedCandidates.map((candidate) => {
                  const campus = campusName(candidate.institution);
                  return (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {campus ? `${candidate.name} · ${campus}` : candidate.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
              disabled={!pickerCandidate}
              onClick={() => setScheduleOpen(true)}
            >
              <CalendarClock className="mr-1.5 h-4 w-4" />
              Schedule
            </Button>
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FILTERS.map((item, index) => {
          const StatIcon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "learner-stat-card p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]",
                filter === item.id && "ring-2 ring-[#023E8A]",
              )}
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconTints[index])}>
                <StatIcon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-2xl font-bold text-[#023E8A]">{counts[item.id]}</p>
              <p className="text-sm font-medium text-[#334155]">{item.label}</p>
              <p className="mt-0.5 text-xs text-[#64748b]">{item.hint}</p>
            </button>
          );
        })}
      </div>

      <section className="learner-stat-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
              Schedule
              <span className="rounded-full bg-[#e8eef7] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#023E8A]">
                {visible.length}
              </span>
            </h2>
            <p className="text-xs text-[#64748b]">Open a candidate, join the meeting, or send the invitation again.</p>
          </div>
          <div className="relative min-w-0 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, campus, or email"
              className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            { id: "all" as const, label: "All modes" },
            { id: INTERVIEW_MODE.VIDEO_CALL, label: "Video" },
            { id: INTERVIEW_MODE.PHONE, label: "Phone" },
            { id: INTERVIEW_MODE.IN_PERSON, label: "In person" },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === item.id ? "bg-[#023E8A] text-white" : "bg-[#f1f5f9] text-[#64748b] hover:text-[#023E8A]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {error ? (
            <EmptyState
              icon={CalendarClock}
              title="Could not load interviews"
              description={error}
              action={{ label: "Try again", onClick: () => void load() }}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={interviews.length === 0 ? "No interviews scheduled" : "No matches"}
              description={
                interviews.length === 0
                  ? "Choose a candidate above to schedule the first interview."
                  : "Try another status, mode, or search."
              }
              action={interviews.length > 0
                ? { label: "Clear filters", onClick: () => { setFilter("upcoming"); setMode("all"); setQuery(""); } }
                : undefined}
            />
          ) : (
            <div className="grid gap-3">
              {visible.map((interview) => {
                const Icon = modeIcon(interview.mode);
                const phase = interviewPhase(interview);
                const campus = campusByCandidate.get(interview.candidateUserId);
                const href = meetingHref(interview.locationOrLink);
                const canManage = phase === "upcoming";
                return (
                  <article
                    key={interview.id}
                    className="rounded-xl border border-[#e2e8f0] bg-white p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <button
                        type="button"
                        onClick={() => navigate(`/recruiter/candidate/${interview.candidateUserId}`)}
                        className="flex min-w-0 flex-1 gap-3 text-left"
                      >
                        <span className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          interview.mode === INTERVIEW_MODE.VIDEO_CALL && "bg-[#e0f2fe] text-[#0369a1]",
                          interview.mode === INTERVIEW_MODE.PHONE && "bg-[#fff7ed] text-[#c2410c]",
                          interview.mode === INTERVIEW_MODE.IN_PERSON && "bg-[#ecfdf5] text-[#059669]",
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-[#023E8A]">{interview.candidateName}</span>
                            {campus ? <span className="text-xs text-[#64748b]">{campus}</span> : null}
                            <StatusBadge variant={phase === "cancelled" ? "destructive" : phase === "past" ? "neutral" : "verified"}>
                              {phase === "cancelled" ? "Cancelled" : phase === "past" ? "Past" : "Scheduled"}
                            </StatusBadge>
                            {interview.emailStatus === "sent" ? (
                              <StatusBadge variant="info">Email sent</StatusBadge>
                            ) : (
                              <StatusBadge variant="warning">Email not sent</StatusBadge>
                            )}
                          </span>
                          <span className="mt-1 block text-sm text-[#334155]">{formatInterviewDateTime(interview.scheduledAt)}</span>
                          <span className="mt-1 block text-sm text-[#64748b]">{interview.candidateEmail}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748b]">
                            <span>{INTERVIEW_MODE_LABELS[interview.mode]}</span>
                            <span>{formatInterviewDuration(interview.durationMinutes)}</span>
                          </span>
                          <span className="mt-1 block break-all text-sm text-[#64748b]">{interview.locationOrLink}</span>
                          {interview.notes ? (
                            <span className="mt-2 block text-sm text-[#64748b]">Notes: {interview.notes}</span>
                          ) : null}
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                          onClick={() => navigate(`/recruiter/candidate/${interview.candidateUserId}`)}
                        >
                          View candidate
                        </Button>
                        {href ? (
                          <Button size="sm" variant="outline" className="rounded-xl" asChild>
                            <a href={href} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Open link
                            </a>
                          </Button>
                        ) : null}
                        {canManage && interview.emailStatus !== "sent" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={busyId === interview.id}
                            onClick={() => void sendEmail(interview.id)}
                          >
                            {busyId === interview.id ? "Sending…" : "Send email"}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-xl"
                            disabled={busyId === interview.id}
                            onClick={() => setCancellingId(interview.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {pickerCandidate ? (
        <ScheduleInterviewDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          candidateId={pickerCandidate.id}
          candidateName={pickerCandidate.name}
          onScheduled={() => void load(true)}
        />
      ) : null}

      <ConfirmDestructiveDialog
        open={Boolean(cancellingId)}
        onOpenChange={(open) => {
          if (!open && !busyId) setCancellingId(null);
        }}
        title="Cancel this interview?"
        description="The candidate will receive an email that this interview has been cancelled."
        confirmLabel="Cancel interview"
        cancelLabel="Keep interview"
        loading={Boolean(busyId)}
        onConfirm={confirmCancel}
      />
    </AppShell>
  );
}

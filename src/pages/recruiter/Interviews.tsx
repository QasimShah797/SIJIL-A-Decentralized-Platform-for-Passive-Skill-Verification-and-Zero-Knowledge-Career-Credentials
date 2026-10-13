import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, CalendarClock, CalendarX, Mail, MapPin, Phone, Search, Video } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { ConfirmDestructiveDialog } from "@/components/sijil/ConfirmDestructiveDialog";
import { Button } from "@/components/ui/button";
import { cancelInterviewApi, listInterviewsApi, resendInterviewEmailApi } from "@/services/api/interview.api";
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
  { id: "upcoming", label: "Upcoming", hint: "Still on the calendar", tone: "bg-info-soft text-info", icon: CalendarClock },
  { id: "cancelled", label: "Cancelled", hint: "Called off", tone: "bg-destructive/10 text-destructive", icon: CalendarX },
  { id: "email", label: "Email pending", hint: "Invitation not sent yet", tone: "bg-warning-soft text-warning", icon: Mail },
  { id: "all", label: "All", hint: "Every interview", tone: "bg-primary/10 text-primary", icon: CalendarCheck },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type ModeFilter = "all" | ScheduledInterviewView["mode"];

function isUpcoming(row: ScheduledInterviewView) {
  return row.status === "scheduled" && new Date(row.scheduledAt).getTime() >= Date.now() - 60_000;
}

function modeIcon(mode: ScheduledInterviewView["mode"]) {
  if (mode === INTERVIEW_MODE.VIDEO_CALL) return Video;
  if (mode === INTERVIEW_MODE.PHONE) return Phone;
  return MapPin;
}

export default function RecruiterInterviews() {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("upcoming");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [query, setQuery] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listInterviewsApi();
      setInterviews(rows);
    } catch (err) {
      setInterviews([]);
      setError(err instanceof Error ? err.message : "Could not load interviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    upcoming: interviews.filter(isUpcoming).length,
    cancelled: interviews.filter((row) => row.status === "cancelled").length,
    email: interviews.filter((row) => row.status === "scheduled" && row.emailStatus !== "sent").length,
    all: interviews.length,
  }), [interviews]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return interviews.filter((row) => {
      if (filter === "cancelled" && row.status !== "cancelled") return false;
      if (filter === "upcoming" && !isUpcoming(row)) return false;
      if (filter === "email" && (row.status !== "scheduled" || row.emailStatus === "sent")) return false;
      if (mode !== "all" && row.mode !== mode) return false;
      if (!needle) return true;
      return `${row.candidateName} ${row.candidateEmail} ${row.locationOrLink}`.toLowerCase().includes(needle);
    });
  }, [filter, interviews, mode, query]);

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">Interviews</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Interviews you scheduled with candidates. Cancelling emails the candidate.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FILTERS.map((item) => {
          const StatIcon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(filter === item.id && item.id !== "upcoming" ? "upcoming" : item.id)}
              className={cn(
                "rounded-2xl border bg-card px-5 py-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === item.id ? "border-primary bg-primary/5 shadow-md" : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{counts[item.id]}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", item.tone)}>
                  <StatIcon className="h-4 w-4" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                Schedule
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {visible.length}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">Open a candidate or send the invitation again.</p>
            </div>
          </div>
          <div className="relative min-w-0 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
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
                mode === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
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
                  ? "Open a candidate profile after verifying their credentials to schedule an interview."
                  : "Try another status, mode, or search."
              }
              action={interviews.length === 0
                ? { label: "Back to dashboard", onClick: () => navigate("/recruiter/search") }
                : { label: "Clear filters", onClick: () => { setFilter("upcoming"); setMode("all"); setQuery(""); } }}
            />
          ) : (
            <div className="grid gap-3">
              {visible.map((interview) => {
                const Icon = modeIcon(interview.mode);
                const cancelled = interview.status === "cancelled";
                return (
                  <article
                    key={interview.id}
                    onClick={() => navigate(`/recruiter/candidate/${interview.candidateUserId}`)}
                    className="cursor-pointer rounded-2xl border border-border/60 bg-background/60 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          interview.mode === INTERVIEW_MODE.VIDEO_CALL && "bg-info-soft text-info",
                          interview.mode === INTERVIEW_MODE.PHONE && "bg-warning-soft text-warning",
                          interview.mode === INTERVIEW_MODE.IN_PERSON && "bg-success-soft text-success",
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">{interview.candidateName}</h3>
                            <StatusBadge variant={cancelled ? "destructive" : "verified"}>
                              {cancelled ? "Cancelled" : "Scheduled"}
                            </StatusBadge>
                            {interview.emailStatus === "sent" ? (
                              <StatusBadge variant="info">Email sent</StatusBadge>
                            ) : (
                              <StatusBadge variant="warning">Email not sent</StatusBadge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-foreground/90">{formatInterviewDateTime(interview.scheduledAt)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{interview.candidateEmail}</p>
                          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span>{INTERVIEW_MODE_LABELS[interview.mode]}</span>
                            <span>{formatInterviewDuration(interview.durationMinutes)}</span>
                          </p>
                          <p className="mt-1 break-all text-sm text-muted-foreground">{interview.locationOrLink}</p>
                          {interview.notes ? (
                            <p className="mt-2 text-sm text-muted-foreground">Notes: {interview.notes}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button
                          size="sm"
                          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => navigate(`/recruiter/candidate/${interview.candidateUserId}`)}
                        >
                          View candidate
                        </Button>
                        {interview.emailStatus !== "sent" && !cancelled && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            disabled={busyId === interview.id}
                            onClick={() => void sendEmail(interview.id)}
                          >
                            {busyId === interview.id ? "Sending…" : "Send email"}
                          </Button>
                        )}
                        {!cancelled && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            disabled={busyId === interview.id}
                            onClick={() => setCancellingId(interview.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

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

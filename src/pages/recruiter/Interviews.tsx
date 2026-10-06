import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, MapPin, Phone, Video } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { Breadcrumb } from "@/components/sijil/Breadcrumb";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { ConfirmDestructiveDialog } from "@/components/sijil/ConfirmDestructiveDialog";
import { Card, CardContent } from "@/components/ui/card";
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
  { id: "upcoming", label: "Upcoming" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

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

  const visible = useMemo(() => {
    if (filter === "cancelled") return interviews.filter((row) => row.status === "cancelled");
    if (filter === "upcoming") {
      return interviews.filter(
        (row) => row.status === "scheduled" && new Date(row.scheduledAt).getTime() >= Date.now() - 60_000,
      );
    }
    return interviews;
  }, [filter, interviews]);

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
      <div className="mb-8 rounded-2xl border border-border/60 bg-[image:var(--gradient-subtle)] px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <Breadcrumb
          className="mb-3"
          items={[
            { label: "Dashboard", href: "/recruiter/search" },
            { label: "Interviews" },
          ]}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-success">Talent workspace</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[2rem] font-semibold leading-none tracking-tight text-foreground">Interviews</h1>
          <p className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
            {visible.length} shown
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Interviews you have scheduled with candidates. Cancelling sends the candidate an email.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? "default" : "outline"}
            className={cn(
              "rounded-full px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              filter !== item.id && "bg-card",
            )}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

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
          title={filter === "cancelled" ? "No cancelled interviews" : "No interviews scheduled"}
          description={
            filter === "upcoming"
              ? "Open a candidate profile after verifying their credentials to schedule an interview."
              : "Nothing to show for this filter."
          }
          action={{ label: "Back to dashboard", onClick: () => navigate("/recruiter/search") }}
        />
      ) : (
        <div className="grid gap-4">
          {visible.map((interview) => {
            const Icon = modeIcon(interview.mode);
            const cancelled = interview.status === "cancelled";
            return (
              <Card key={interview.id} className="rounded-2xl border-border/60 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">{interview.candidateName}</h2>
                      <StatusBadge variant={cancelled ? "destructive" : "verified"}>
                        {cancelled ? "Cancelled" : "Scheduled"}
                      </StatusBadge>
                      {interview.emailStatus === "sent" ? (
                        <StatusBadge variant="info">Email sent</StatusBadge>
                      ) : (
                        <StatusBadge variant="warning">Email not sent</StatusBadge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90">{formatInterviewDateTime(interview.scheduledAt)}</p>
                    <p className="text-sm text-muted-foreground">{interview.candidateEmail}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {INTERVIEW_MODE_LABELS[interview.mode]}
                      </span>
                      <span>{formatInterviewDuration(interview.durationMinutes)}</span>
                    </p>
                    <p className="break-all text-sm text-muted-foreground">{interview.locationOrLink}</p>
                    {interview.notes && (
                      <p className="text-sm text-muted-foreground">Notes: {interview.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => navigate(`/recruiter/candidate/${interview.candidateUserId}`)}
                    >
                      View candidate
                    </Button>
                    {interview.emailStatus !== "sent" && (
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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

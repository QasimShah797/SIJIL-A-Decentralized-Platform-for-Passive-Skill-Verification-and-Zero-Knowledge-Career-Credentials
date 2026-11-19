import { useEffect, useState } from "react";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { listMyInterviewsApi } from "@/services/api/interview.api";
import {
  INTERVIEW_MODE,
  INTERVIEW_MODE_LABELS,
  formatInterviewDateTime,
  formatInterviewDuration,
  type ScheduledInterviewView,
} from "@/lib/interview";

export default function LearnerInterviews() {
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listMyInterviewsApi()
      .then((rows) => {
        if (!cancelled) setInterviews(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load interviews");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#023E8A]">Interview invitations</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Invitations sent to your verified SIJIL account stay here, including ones whose email did not go out.
        </p>
      </div>
      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState
          icon={CalendarClock}
          title="Interviews could not be loaded"
          description={error}
        />
      ) : interviews.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No interview invitations yet"
          description="When a recruiter schedules an interview, it appears here even if the email does not arrive."
        />
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const ModeIcon = interview.mode === INTERVIEW_MODE.VIDEO_CALL ? Video : MapPin;
            return (
              <article key={interview.id} className="learner-stat-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#023E8A]">
                      {interview.recruiterName}
                      {interview.recruiterCompany ? ` · ${interview.recruiterCompany}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[#334155]">
                      {formatInterviewDateTime(interview.scheduledAt, interview.timeZone)} · {formatInterviewDuration(interview.durationMinutes)}
                    </p>
                  </div>
                  <StatusBadge variant={interview.status === "cancelled" ? "destructive" : "verified"}>
                    {interview.status === "cancelled" ? "Cancelled" : "Scheduled"}
                  </StatusBadge>
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#334155]">
                  <ModeIcon className="h-4 w-4 text-[#023E8A]" />
                  <span>{INTERVIEW_MODE_LABELS[interview.mode]}</span>
                  <span>·</span>
                  {(() => {
                    const href = interview.locationOrLink.trim().match(/^https?:\/\//i)
                      ? interview.locationOrLink.trim()
                      : null;
                    return href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#023E8A] underline underline-offset-2"
                      >
                        Join Google Meet
                      </a>
                    ) : (
                      <span>{interview.locationOrLink}</span>
                    );
                  })()}
                </p>
                {interview.notes ? (
                  <p className="mt-2 text-sm text-[#64748b]">{interview.notes}</p>
                ) : null}
                <p className="mt-3 text-xs text-[#94a3b8]">
                  Email: {interview.emailStatus === "sent" ? "sent" : interview.emailStatus === "failed" ? "not delivered" : "not sent"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </LearnerWorkspaceShell>
  );
}

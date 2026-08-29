import { BookOpen, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  activityStatusBadge,
  formatCompletionStatusLabel,
  formatGradeDisplay,
  formatMoodleFeedbackDisplay,
  formatSubmissionStatusLabel,
} from "@/lib/moodle-integration";
import type { MoodleCourseActivity } from "@/lib/moodle-integration";
import type { CustEvidence } from "@/lib/cust-lms";
import { IntegrationEmptyState } from "./IntegrationEmptyState";
import { LMSActivityRow } from "./LMSActivityRow";

export type LMSActivityPanelProps = {
  connected: boolean;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  moodleEmail?: string | null;
  moodleSiteHost: string;
  lastSync: string | null;
  recordCount: number;
  activities: MoodleCourseActivity[];
  otherRecords: CustEvidence[];
  onConnect: () => void;
  onSync: () => void;
};

export function LMSActivityPanel({
  connected,
  loading,
  syncing,
  error,
  moodleEmail,
  moodleSiteHost,
  lastSync,
  recordCount,
  activities,
  otherRecords,
  onConnect,
  onSync,
}: LMSActivityPanelProps) {
  const totalAssignments = activities.reduce((n, c) => n + c.assignments.length, 0);

  return (
    <div className="learner-stat-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e2e8f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
            <BookOpen className="h-4 w-4" aria-hidden />
            Recent LMS Activity
          </h2>
          {connected && moodleEmail ? (
            <p className="mt-0.5 text-xs text-[#64748b]">
              {totalAssignments} records · connected as {moodleEmail}
            </p>
          ) : null}
        </div>
        {connected ? (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl border-[#e2e8f0]"
            onClick={onSync}
            disabled={syncing}
          >
            <RefreshCw className={"mr-1.5 h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />
            {syncing ? "Syncing…" : "Sync Moodle Activities"}
          </Button>
        ) : null}
      </div>

      <div className="p-5">
        {!connected ? (
          <IntegrationEmptyState
            icon={BookOpen}
            title="Connect Moodle to import recent activity"
            hint="Sync enrolled courses to import assignments and grades."
            action={
              <Button size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onConnect} disabled={syncing}>
                <Link2 className="mr-1.5 h-4 w-4" />
                Connect Moodle
              </Button>
            }
          />
        ) : loading ? (
          <p className="py-6 text-center text-sm text-[#64748b]">Loading Moodle activity…</p>
        ) : error ? (
          <IntegrationEmptyState
            icon={BookOpen}
            title="Could not sync Moodle data"
            hint={error}
            action={
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onSync} disabled={syncing}>
                <RefreshCw className={"mr-1.5 h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />
                Sync Moodle Activities
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {activities.length === 0 ? (
              <IntegrationEmptyState
                compact
                icon={BookOpen}
                title="This Moodle account is connected but is not enrolled in any courses."
                action={
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={onSync} disabled={syncing}>
                    <RefreshCw className={"mr-1.5 h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />
                    Sync Moodle Activities
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {activities.flatMap((course) =>
                  course.assignments.length === 0
                    ? [
                        <div key={`empty-${course.courseId}`} className="learner-stat-card border border-[#e2e8f0] p-5 lg:col-span-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-[#023E8A]">{course.courseName}</p>
                          </div>
                          <p className="mt-2 text-sm text-[#64748b]">
                            No assignments are currently available for this course.
                          </p>
                        </div>,
                      ]
                    : course.assignments.map((a) => (
                        <LMSActivityRow
                          key={a.id}
                          courseName={course.courseName}
                          courseShortname={course.shortname}
                          completionStatus={course.completionStatus}
                          assignment={a}
                          formatGrade={formatGradeDisplay}
                          formatFeedback={formatMoodleFeedbackDisplay}
                          formatSubmission={formatSubmissionStatusLabel}
                          activityStatusBadge={activityStatusBadge}
                        />
                      )),
                )}
              </div>
            )}

            {otherRecords.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-[#e2e8f0]">
                <div className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
                  <p className="text-sm font-semibold text-[#023E8A]">Other LMS evidence</p>
                </div>
                <div className="divide-y divide-[#e2e8f0]">
                  {otherRecords.map((r) => (
                    <div key={r.id} className="grid grid-cols-2 gap-2 px-4 py-3 text-sm sm:grid-cols-4">
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="truncate font-medium text-[#334155]">{r.course_name}</p>
                      </div>
                      <p className="text-xs text-[#64748b]">{r.grade ?? "—"}</p>
                      <p className="text-xs text-[#64748b]">{r.completion_status ?? "—"}</p>
                      <p className="text-xs text-[#64748b]">{new Date(r.fetched_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="sr-only">
              Host {moodleSiteHost} · Last sync {lastSync ?? "—"} · {recordCount} imported
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

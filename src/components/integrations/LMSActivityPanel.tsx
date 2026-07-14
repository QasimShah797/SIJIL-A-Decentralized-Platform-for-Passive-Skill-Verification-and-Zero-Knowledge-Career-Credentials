import { BookOpen, Link2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/sijil/StatusBadge";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4" aria-hidden />
          Recent LMS Activity
          {connected && totalAssignments > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              · {totalAssignments} {totalAssignments === 1 ? "record" : "records"}
            </span>
          )}
        </CardTitle>
        {connected && (
          <Button size="sm" variant="outline" onClick={onSync} disabled={syncing} className="shrink-0">
            <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
            {syncing ? "Syncing…" : "Sync Moodle Activities"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {!connected ? (
          <IntegrationEmptyState
            icon={BookOpen}
            title="Connect Moodle to import recent activity"
            hint="Sync enrolled courses to import assignments and grades."
            action={
              <Button size="sm" onClick={onConnect} disabled={syncing}>
                <Link2 className="h-4 w-4 mr-1.5" />
                Connect Moodle
              </Button>
            }
          />
        ) : loading ? (
          <p className="py-6 text-sm text-muted-foreground text-center">Loading Moodle activity…</p>
        ) : error ? (
          <IntegrationEmptyState
            icon={BookOpen}
            title="Could not sync Moodle data"
            hint={error}
            action={
              <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
                Sync Moodle Activities
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <StatusBadge variant="verified">Connected</StatusBadge>
              {moodleEmail && (
                <span className="text-muted-foreground">
                  User: <span className="text-foreground">{moodleEmail}</span>
                </span>
              )}
              <span className="text-muted-foreground">
                Host: <span className="text-foreground">{moodleSiteHost}</span>
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                Last sync: {lastSync ?? "—"} · {recordCount} imported
              </span>
            </div>

            {activities.length === 0 ? (
              <IntegrationEmptyState
                compact
                icon={BookOpen}
                title="This Moodle account is connected but is not enrolled in any courses."
                action={
                  <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                    <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
                    Sync Moodle Activities
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {activities.map((course) => (
                  <div key={course.courseId} className="rounded-xl border overflow-hidden">
                    <div className="border-b bg-muted/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{course.courseName}</p>
                        {course.shortname && (
                          <p className="text-xs text-muted-foreground">{course.shortname}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge variant={activityStatusBadge(formatCompletionStatusLabel(course.completionStatus))}>
                          {formatCompletionStatusLabel(course.completionStatus)}
                        </StatusBadge>
                        <span className="text-xs text-muted-foreground self-center">
                          {course.assignments.length} assignment{course.assignments.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    {course.assignments.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        No assignments are currently available for this course.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {course.assignments.map((a) => (
                          <LMSActivityRow
                            key={a.id}
                            assignment={a}
                            formatGrade={formatGradeDisplay}
                            formatFeedback={formatMoodleFeedbackDisplay}
                            formatSubmission={formatSubmissionStatusLabel}
                            activityStatusBadge={activityStatusBadge}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {otherRecords.length > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <div className="border-b bg-muted/30 px-4 py-2.5">
                  <p className="text-sm font-medium">Other LMS evidence</p>
                </div>
                <div className="divide-y">
                  {otherRecords.map((r) => (
                    <div key={r.id} className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div className="col-span-2 sm:col-span-1 min-w-0">
                        <p className="font-medium truncate">{r.course_name}</p>
                      </div>
                      <p className="text-muted-foreground text-xs">{r.grade ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">{r.completion_status ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(r.fetched_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

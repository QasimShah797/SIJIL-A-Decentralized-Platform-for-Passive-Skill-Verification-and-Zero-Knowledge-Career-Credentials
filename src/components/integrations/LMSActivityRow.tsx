import { StatusBadge } from "@/components/sijil/StatusBadge";
import type { MoodleAssignmentActivity } from "@/lib/moodle-integration";

export type LMSActivityRowProps = {
  assignment: MoodleAssignmentActivity;
  formatGrade: (a: MoodleAssignmentActivity) => string;
  formatFeedback: (feedback: string | null | undefined) => string | null;
  formatSubmission: (status: string) => string;
  activityStatusBadge: (status: string) => "verified" | "info" | "warning" | "neutral";
};

export function LMSActivityRow({
  assignment: a,
  formatGrade,
  formatFeedback,
  formatSubmission,
  activityStatusBadge,
}: LMSActivityRowProps) {
  const feedbackText = formatFeedback(a.feedback);
  const gradeText = formatGrade(a);
  const submissionLabel = formatSubmission(a.submissionStatus);
  const hasGradeValue =
    gradeText !== "Not graded"
    && gradeText !== "Grade not synced — refresh Moodle data"
    && gradeText !== "—"
    && gradeText !== "-";
  const importedLabel = a.importedAt
    ? new Date(a.importedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="px-4 py-3.5 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{a.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {a.activityType} · LMS
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <StatusBadge variant={activityStatusBadge(submissionLabel)}>
            {submissionLabel}
          </StatusBadge>
          <StatusBadge variant={hasGradeValue ? "verified" : "warning"}>
            {hasGradeValue ? "Graded" : "Not graded"}
          </StatusBadge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs max-w-md">
        <div>
          <p className="text-muted-foreground mb-0.5">Grade</p>
          <p className="font-medium text-foreground">{gradeText}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Status</p>
          <p className="font-medium text-foreground">{submissionLabel}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Imported</p>
          <p className="font-medium text-foreground">{importedLabel}</p>
        </div>
      </div>

      {feedbackText && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
          <p className="text-muted-foreground mb-0.5">Feedback</p>
          <p className="text-foreground/90 leading-relaxed">&ldquo;{feedbackText}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

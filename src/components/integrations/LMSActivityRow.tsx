import { BookOpen } from "lucide-react";
import type { MoodleAssignmentActivity } from "@/lib/moodle-integration";

export type LMSActivityRowProps = {
  courseName: string;
  courseShortname?: string | null;
  completionStatus?: string | null;
  assignment: MoodleAssignmentActivity;
  formatGrade: (a: MoodleAssignmentActivity) => string;
  formatFeedback: (feedback: string | null | undefined) => string | null;
  formatSubmission: (status: string) => string;
  activityStatusBadge: (status: string) => "verified" | "info" | "warning" | "neutral";
};

function gradePercent(gradeText: string): number {
  const match = gradeText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const num = Number(match[1]);
  const max = Number(match[2]);
  if (!max) return 0;
  return Math.min(100, Math.round((num / max) * 100));
}

export function LMSActivityRow({
  courseName,
  courseShortname,
  completionStatus,
  assignment: a,
  formatGrade,
  formatFeedback,
  formatSubmission,
}: LMSActivityRowProps) {
  const feedbackText = formatFeedback(a.feedback);
  const gradeText = formatGrade(a);
  const submissionLabel = formatSubmission(a.submissionStatus);
  const percent = gradePercent(gradeText);
  const importedLabel = a.importedAt
    ? new Date(a.importedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  const courseLabel = courseShortname || courseName;

  return (
    <div className="learner-stat-card border border-[#e2e8f0] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff7ed] text-[#ea580c]">
            <BookOpen className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#023E8A]">{courseLabel}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#64748b]">{a.activityType}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#fef9c3] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#a16207]">
          {formatSubmission(completionStatus ?? submissionLabel).toUpperCase().includes("PROGRESS")
            ? "In progress"
            : submissionLabel}
        </span>
      </div>

      <h3 className="mt-4 text-sm font-semibold leading-snug text-[#0f172a]">{a.name}</h3>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Grade</p>
          <p className="font-semibold text-[#023E8A]">{gradeText}</p>
          {percent > 0 ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div className="h-full rounded-full bg-[#023E8A]" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Status</p>
          <p className="font-semibold text-[#334155]">{submissionLabel}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Imported</p>
          <p className="font-semibold text-[#334155]">{importedLabel}</p>
        </div>
      </div>

      {feedbackText ? (
        <div className="mt-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Feedback</p>
          <p className="text-xs leading-relaxed text-[#334155]">&ldquo;{feedbackText}&rdquo;</p>
        </div>
      ) : null}
    </div>
  );
}

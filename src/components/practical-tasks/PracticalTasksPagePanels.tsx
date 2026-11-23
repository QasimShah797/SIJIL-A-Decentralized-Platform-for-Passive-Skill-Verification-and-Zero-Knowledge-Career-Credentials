import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Crosshair,
  Eye,
  Flag,
  Keyboard,
  ListOrdered,
  MousePointer2,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeclaredSkill } from "@/lib/sijil-data";
import {
  isMcqRowCompleted,
  type McqAttemptResultRow,
  type PracticalTaskState,
} from "@/lib/db/practical-attempts";
import {
  isMcqPassed,
  mcqResultLabel,
  type McqQuestion,
  type McqQuestionKind,
} from "@/lib/mcq-tasks";
import { useState } from "react";

export type TaskFilter = "all" | "in_progress" | "completed" | "locked";

const SKILL_ICON_COLORS = ["hsl(var(--sijil-blue))", "#CA8A04", "#DC2626", "#059669", "#0891B2", "#7C3AED"];

export function skillInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function skillIconColor(index: number): string {
  return SKILL_ICON_COLORS[index % SKILL_ICON_COLORS.length];
}

export function PracticalTasksBreadcrumbBar({ didShort }: { didShort?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
        <Link to="/learner/profile" className="hover:text-sijil-blue">
          Learner
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span>Skill confirmation workspace</span>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-semibold text-sijil-blue">Practical Tasks</span>
      </nav>
      {didShort ? (
        <span className="mono rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[10px] text-[#64748b]">
          {didShort}
        </span>
      ) : null}
    </div>
  );
}

export function PracticalTasksHero({
  onStartNext,
  hasNextTask,
}: {
  onStartNext: () => void;
  hasNextTask: boolean;
}) {
  return (
    <section className="pt-lab-hero mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white sm:text-[1.75rem]">Practical Tasks</h1>
        <p className="mt-2 text-sm text-[hsl(var(--sijil-blue)/0.07)]">Practice your skills and review your results.</p>
      </div>
      <Button
        className="shrink-0 rounded-xl bg-white text-sijil-blue hover:bg-[#ede9fe] disabled:opacity-70"
        onClick={onStartNext}
        disabled={!hasNextTask}
      >
        <Play className="mr-1.5 h-4 w-4" />
        Start Next Task
      </Button>
    </section>
  );
}

export function TaskFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: TaskFilter;
  onChange: (v: TaskFilter) => void;
  counts?: Partial<Record<TaskFilter, number>>;
}) {
  const tabs: { id: TaskFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_progress", label: "In Progress" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-[#f1f5f9] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            value === tab.id ? "bg-sijil-blue text-white" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          {tab.label}
          {counts?.[tab.id] != null ? (
            <span className={cn("ml-1.5 tabular-nums", value === tab.id ? "text-white/80" : "text-[#94a3b8]")}>
              ({counts[tab.id]})
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export type TaskCardDisplay = {
  percentage: number | null;
  passed: boolean | null;
  label: string | null;
};

export function attemptOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function formatAttemptDateTime(iso: string | null | undefined): string {
  if (!iso) return "Time not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type GradedAttempt = {
  id: string;
  attemptNumber: number;
  percentage: number | null;
  passed: boolean | null;
  label: string | null;
  at: string | null;
  title: string | null;
};

export function gradedAttempts(rows: McqAttemptResultRow[]): GradedAttempt[] {
  return rows
    .filter(isMcqRowCompleted)
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.submitted_at ?? a.created_at ?? 0).getTime();
      const bTime = new Date(b.submitted_at ?? b.created_at ?? 0).getTime();
      return aTime - bTime;
    })
    .map((row, index) => {
      const percentage = typeof row.percentage === "number" ? row.percentage : null;
      const attemptNumber = index + 1;
      const passed = typeof row.passed === "boolean" ? row.passed : isMcqPassed(percentage);
      return {
        id: row.id,
        attemptNumber,
        percentage,
        passed,
        label: mcqResultLabel(percentage, passed, attemptNumber),
        at: row.submitted_at ?? row.created_at,
        title: row.title,
      };
    });
}

export function AttemptMarksTimeline({
  rows,
  skillName,
  compact = false,
}: {
  rows: McqAttemptResultRow[];
  skillName?: string;
  compact?: boolean;
}) {
  const items = gradedAttempts(rows);
  if (items.length === 0) {
    return <p className="text-xs text-[#94a3b8]">No attempts yet.</p>;
  }

  return (
    <ol className={cn("space-y-3", !compact && "pt-attempt-timeline")}>
      {items.map((item) => {
        const isRetake = item.attemptNumber > 1;
        return (
          <li key={item.id} className={cn("flex items-start gap-3", !compact && "pt-attempt-timeline-item")}>
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#059669]" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-[#0f172a]">
                  {isRetake ? `Retake ${item.attemptNumber - 1}` : `Attempt ${item.attemptNumber}`}
                  {skillName ? <span className="font-medium text-[#64748b]"> · {skillName}</span> : null}
                  {isRetake ? (
                    <span className="ml-2 rounded-full bg-[hsl(var(--sijil-blue)/0.04)] px-2 py-0.5 text-[10px] font-semibold text-sijil-blue">
                      Retake
                    </span>
                  ) : null}
                </p>
                <p className="text-sm font-bold tabular-nums text-[#0f172a]">
                  {item.percentage != null ? `${item.percentage}%` : "—"}
                </p>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#64748b]">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {formatAttemptDateTime(item.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PracticalTaskCard({
  skill,
  index,
  taskState,
  display,
  history,
  locked,
  lastDays,
  onStart,
  onResume,
  onView,
  onRetake,
}: {
  skill: DeclaredSkill;
  index: number;
  taskState: PracticalTaskState;
  display: TaskCardDisplay;
  history: McqAttemptResultRow[];
  locked: boolean;
  lastDays: number | null;
  onStart: () => void;
  onResume: () => void;
  onView: () => void;
  onRetake: () => void;
}) {
  const color = skillIconColor(index);
  const score = display.percentage;
  const attempts = gradedAttempts(history);
  const [timelineOpen, setTimelineOpen] = useState(attempts.length > 0);
  const latestIsRetake = attempts.length > 1;
  const taskTitle = skill.name.toLowerCase().includes("practical")
    ? skill.name
    : `${skill.name} Practical Task`;

  return (
    <article className="learner-stat-card pt-task-card p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {skillInitials(skill.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold text-[#0f172a]">{taskTitle}</h3>
              <p className="mt-0.5 text-xs text-[#64748b]">
                {skill.domain || "General"} | {skill.name}
              </p>
              <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                Last synced: {lastDays === null ? "never" : lastDays === 0 ? "today" : `${lastDays} day${lastDays === 1 ? "" : "s"} ago`}
              </p>
            </div>

            {score != null && (taskState === "COMPLETED" || attempts.length > 0) && (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-[#64748b]">
                  <span>
                    Latest score
                    {latestIsRetake ? (
                      <span className="ml-2 rounded-full bg-[hsl(var(--sijil-blue)/0.04)] px-2 py-0.5 text-[10px] font-semibold text-sijil-blue">
                        Retake
                      </span>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums text-[#0f172a]">{score}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div
                    className="h-full rounded-full bg-[#6d28d9]"
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                  />
                </div>
              </div>
            )}

            {taskState === "IN_PROGRESS" && (
              <p className="mt-3 text-xs font-semibold text-sijil-blue">
                {attempts.length > 0 ? "Retake in progress" : "In progress"}
              </p>
            )}
            {locked && taskState !== "COMPLETED" && taskState !== "IN_PROGRESS" && (
              <p className="mt-3 text-xs text-[#64748b]">Locked until next credential sync</p>
            )}
          </div>
        </div>

        <div className="pt-task-actions flex flex-wrap items-center gap-2">
          {taskState === "COMPLETED" ? (
            <>
              <Button variant="outline" size="sm" className="rounded-xl border-[#e2e8f0]" onClick={onView}>
                <Eye className="mr-1 h-4 w-4" aria-hidden /> View Result
              </Button>
              <Button size="sm" className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onRetake}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Retake Task
              </Button>
            </>
          ) : taskState === "IN_PROGRESS" ? (
            <Button size="sm" className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onResume}>
              <Play className="mr-1 h-3.5 w-3.5" />
              Continue Task
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-xl bg-sijil-blue hover:bg-sijil-blue"
              onClick={onStart}
              disabled={locked}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {locked ? "Link evidence" : "Start Task"}
            </Button>
          )}
        </div>
      </div>

      {attempts.length > 0 && (
        <div className="mt-4 border-t border-[#e2e8f0] pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#0f172a]"
            aria-expanded={timelineOpen}
            onClick={() => setTimelineOpen((open) => !open)}
          >
            <span>Attempt history ({attempts.length})</span>
            <ChevronDown className={cn("h-4 w-4 text-[#64748b] transition", timelineOpen && "rotate-180")} />
          </button>
          {timelineOpen ? (
            <div className="mt-3">
              <AttemptMarksTimeline rows={history} compact />
            </div>
          ) : (
            attempts.slice(-1).map((item) => (
              <div key={item.id} className="mt-2 flex items-center justify-between text-xs text-[#64748b]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {formatAttemptDateTime(item.at)}
                </span>
                <span className="font-semibold tabular-nums text-[#0f172a]">
                  {item.percentage != null ? `${item.percentage}%` : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}

export type AttemptHistoryEntry = {
  id: string;
  skillName: string;
  attemptNumber: number;
  percentage: number | null;
  passed: boolean | null;
  at: string | null;
};

export function AttemptTimelinePanel({ entries }: { entries: AttemptHistoryEntry[] }) {
  return (
    <div className="learner-stat-card p-4">
      <h2 className="text-base font-semibold text-sijil-blue">Attempt Timeline</h2>
      <p className="mt-1 text-xs text-[#64748b]">Scores and dates for your completed attempts.</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-[#94a3b8]">No graded attempts yet. Finish a task and it will appear here.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-xs font-semibold text-[#0f172a]">
                  {entry.skillName}
                  <span className="font-medium text-[#64748b]"> · {attemptOrdinal(entry.attemptNumber)} attempt</span>
                </p>
                <p className="shrink-0 text-xs font-bold tabular-nums text-[#5421ae]">
                  {entry.percentage != null ? `${entry.percentage}%` : "—"}
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-[#64748b]">{formatAttemptDateTime(entry.at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssessmentRulesPanel() {
  const rules = [
    ["Format", "Closed-ended only"],
    ["Clock", "30 seconds per question"],
    ["Progression", "Any score advances the skill"],
    ["Retake", "Latest marks replace the previous score"],
    ["Before submit", "Flag, then review"],
    ["Keyboard", "A–D, arrows, F"],
    ["Based on", "Competency + platform evidence"],
  ] as const;

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-sijil-blue">Assessment rules</p>
      <dl className="mt-3 space-y-2">
        {rules.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-[#64748b]">{k}</dt>
            <dd className="font-semibold text-[#334155]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PracticalTasksFooter() {
  return (
    <footer className="mt-10 border-t border-[#e2e8f0] pt-6 text-center text-xs text-[#94a3b8]">
      SIJIL · Learner verification workspace
    </footer>
  );
}

export function McqProgressSegments({
  total,
  currentIndex,
  submitted,
}: {
  total: number;
  currentIndex: number;
  submitted?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "pt-mcq-segment",
            i < currentIndex && "pt-mcq-segment--done-pass",
            i === currentIndex && !submitted && "pt-mcq-segment--done",
            i < currentIndex && submitted && "pt-mcq-segment--done-pass",
          )}
        />
      ))}
    </div>
  );
}

export function McqQuestionPalette({
  questionIds,
  currentIndex,
  answeredIds,
  flaggedIds,
  maxVisitedIndex,
  kinds,
  onJump,
}: {
  questionIds: string[];
  currentIndex: number;
  answeredIds: Set<string>;
  flaggedIds: Set<string>;
  maxVisitedIndex: number;
  kinds?: Array<McqQuestionKind | undefined>;
  onJump: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Question navigator">
        {questionIds.map((id, index) => {
          const answered = answeredIds.has(id);
          const flagged = flaggedIds.has(id);
          const current = index === currentIndex;
          const locked = index > maxVisitedIndex;
          const isCode = kinds?.[index] === "code";
          return (
            <button
              key={id}
              type="button"
              disabled={locked}
              onClick={() => onJump(index)}
              aria-current={current ? "step" : undefined}
              aria-label={`Question ${index + 1}${isCode ? ", code lab" : ""}${answered ? ", answered" : ", unanswered"}${flagged ? ", flagged" : ""}${locked ? ", not reached yet" : ""}`}
              className={cn(
                "pt-mcq-nav",
                isCode && "pt-mcq-nav--code",
                current && "pt-mcq-nav--current",
                answered && !current && "pt-mcq-nav--answered",
                flagged && "pt-mcq-nav--flagged",
                locked && "pt-mcq-nav--locked",
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#94a3b8]">
        <span className="inline-flex items-center gap-1"><i className="pt-mcq-legend pt-mcq-legend--current" /> Current</span>
        <span className="inline-flex items-center gap-1"><i className="pt-mcq-legend pt-mcq-legend--answered" /> Answered</span>
        <span className="inline-flex items-center gap-1"><i className="pt-mcq-legend pt-mcq-legend--flagged" /> Flagged</span>
        <span className="inline-flex items-center gap-1"><i className="pt-mcq-legend pt-mcq-legend--code" /> Code lab</span>
      </div>
    </div>
  );
}

export function McqCodeStage({ code, language }: { code: string; language?: string }) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  return (
    <div className="pt-code-stage" aria-label="Code snippet">
      <div className="pt-code-stage-bar">
        <span className="font-mono uppercase tracking-wide">{language || "code"}</span>
        <span>Find the bug</span>
      </div>
      <pre className="pt-code-stage-pre">
        {lines.map((line, index) => (
          <div key={`${index}-${line}`} className="pt-code-line">
            <span className="pt-code-gutter">{index + 1}</span>
            <code>{line || " "}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function McqReviewList({
  questions,
  answers,
  flaggedIds,
  onJump,
}: {
  questions: McqQuestion[];
  answers: Record<string, string | string[] | Record<string, string> | undefined>;
  flaggedIds: Set<string>;
  onJump: (index: number) => void;
}) {
  const answered = questions.filter((question) => answers[question.id]).length;
  const flagged = questions.filter((question) => flaggedIds.has(question.id)).length;
  const blank = questions.length - answered;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Answered", answered, "text-[#059669]"],
          ["Flagged", flagged, "text-[#CA8A04]"],
          ["Blank", blank, "text-[#DC2626]"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
            <p className={cn("text-lg font-bold tabular-nums", String(tone))}>{value}</p>
          </div>
        ))}
      </div>
      {blank > 0 ? (
        <p className="rounded-lg bg-[#fef9c3] px-3 py-2 text-xs text-[#854d0e]">
          {blank} question{blank === 1 ? "" : "s"} still blank. Blank answers are scored as incorrect.
        </p>
      ) : (
        <p className="rounded-lg bg-[#ecfdf5] px-3 py-2 text-xs text-[#047857]">
          Every question has an answer. You can still jump back and change one before submitting.
        </p>
      )}
      <ul className="space-y-2">
        {questions.map((question, index) => {
          const selected = answers[question.id];
          const selectedId = typeof selected === "string" ? selected : undefined;
          const option = question.options.find((item) => item.id === selectedId);
          const isFlagged = flaggedIds.has(question.id);
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onJump(index)}
                className="flex w-full items-start gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-left hover:border-[hsl(var(--sijil-blue)/0.29)]"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#f1f5f9] text-[11px] font-bold text-[#334155]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-medium text-[#0f172a]">{question.question}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#64748b]">
                    {question.kind === "code" ? (
                      <span className="font-semibold text-[#0f766e]">Code lab</span>
                    ) : null}
                    <span>{selectedId ? `${selectedId}. ${option?.text ?? "Selected"}` : selected ? "Answered" : "No answer yet"}</span>
                    {isFlagged ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#CA8A04]">
                        <Flag className="h-3 w-3" /> Flagged
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function McqScoreSummary({
  percentage,
  correctCount,
  totalQuestions,
  label,
  passed,
  message,
  submittedAt,
  variant = "result",
}: {
  percentage: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  label: string | null;
  passed: boolean | null;
  message?: string | null;
  submittedAt?: string | null;
  variant?: "result" | "previous";
}) {
  void passed;
  const pct = typeof percentage === "number" ? Math.max(0, Math.min(100, percentage)) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const tone = "#22c55e";

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88" aria-hidden>
            <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={typeof percentage === "number" ? tone : "#cbd5e1"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xl font-bold tabular-nums text-[#0f172a]">
              {percentage ?? "—"}
              <span className="text-sm">%</span>
            </p>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Crosshair className="mt-0.5 h-4 w-4 text-sijil-blue" aria-hidden />
            <div>
              <p className="text-xs text-[#64748b]">Correct Answers</p>
              <p className="text-sm font-semibold text-[#0f172a]">
                {correctCount != null && totalQuestions != null
                  ? `${correctCount} of ${totalQuestions}`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 text-sijil-blue" aria-hidden />
            <div>
              <p className="text-xs text-[#64748b]">
                {variant === "previous" ? "Attempted" : "Submitted"}
              </p>
              <p className="text-sm font-semibold text-[#0f172a]">
                {formatAttemptDateTime(submittedAt)}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
      {label ? <p className="mt-3 text-xs font-semibold text-sijil-blue">{label}</p> : null}
      {message ? <p className="mt-2 text-xs text-[#64748b]">{message}</p> : null}
    </div>
  );
}

export function RetakeIntroBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--sijil-blue)/0.17)] bg-[hsl(var(--sijil-blue)/0.04)] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sijil-blue text-white">
        <RotateCcw className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0f172a]">Retake the Task</p>
        <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
          You can try again. Your new result will replace the previous one.
        </p>
      </div>
    </div>
  );
}

export function TaskDetailsGrid() {
  const items = [
    { icon: Clock3, title: "Time", detail: "30 seconds per question" },
    { icon: MousePointer2, title: "Navigation", detail: "Move between questions" },
    { icon: Keyboard, title: "Keyboard", detail: "A-D or 1–4 to choose, arrow keys to move" },
  ] as const;

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-[#0f172a]">Task Details</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="rounded-xl border border-[#e2e8f0] bg-white p-3">
            <Icon className="mb-2 h-4 w-4 text-sijil-blue" aria-hidden />
            <p className="text-xs font-semibold text-[#0f172a]">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#64748b]">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function McqOptionButton({
  optionId,
  text,
  selected,
  onSelect,
}: {
  optionId: string;
  text: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("pt-mcq-option", selected && "pt-mcq-option--selected")}
    >
      <span className="pt-mcq-option-letter">{optionId}</span>
      <span className="font-mono text-sm leading-relaxed text-[#334155]">{text}</span>
    </button>
  );
}

export function EmptyTasksPanel({ onGoProfile }: { onGoProfile: () => void }) {
  return (
    <div className="learner-stat-card flex flex-col items-center px-6 py-12 text-center">
      <Play className="mb-3 h-8 w-8 text-[#94a3b8]" />
      <p className="font-semibold text-[#0f172a]">No declared competencies</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">
        Declare a competency by name on your profile before starting a practical task.
      </p>
      <Button className="mt-4 rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={onGoProfile}>
        Go to profile
      </Button>
    </div>
  );
}

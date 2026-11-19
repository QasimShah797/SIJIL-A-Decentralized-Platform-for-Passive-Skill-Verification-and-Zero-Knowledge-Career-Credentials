import { Link } from "react-router-dom";
import {
  ChevronRight,
  Eye,
  Flag,
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
  MCQ_PASS_PERCENT,
  mcqResultLabel,
  type McqQuestion,
  type McqQuestionKind,
} from "@/lib/mcq-tasks";

export type TaskFilter = "all" | "in_progress" | "graded" | "locked";

const SKILL_ICON_COLORS = ["#023E8A", "#CA8A04", "#DC2626", "#059669", "#0891B2", "#7C3AED"];

export function skillInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function skillIconColor(index: number): string {
  return SKILL_ICON_COLORS[index % SKILL_ICON_COLORS.length];
}

function MiniBarChart({ score }: { score: number | null }) {
  const base = score ?? 30;
  const heights = [0.45, 0.65, 0.85, 1].map((m) => Math.round(base * m));
  return (
    <div className="pt-task-mini-bars" aria-hidden>
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn("pt-task-mini-bar", i >= 2 && "pt-task-mini-bar--active")}
          style={{ height: `${Math.max(8, h * 0.28)}px` }}
        />
      ))}
    </div>
  );
}

export function PracticalTasksBreadcrumbBar({ didShort }: { didShort?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
        <Link to="/learner/profile" className="hover:text-[#023E8A]">
          Learner
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span>Verification workspace</span>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-semibold text-[#023E8A]">Practical Tasks</span>
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
    <section className="pt-lab-hero mb-5">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          <Eye className="h-3 w-3" aria-hidden />
          Competency lab
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white sm:text-[1.75rem]">Practical Tasks</h1>
        <p className="mt-2 max-w-xl text-sm text-white/75">
          Take a timed sitting, then retake it later if you want another score. Every attempt stays on the timeline with its marks, date, and time.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pt-round-pill">Retake any time · history kept</span>
          <span className="pt-round-pill pt-round-pill--code">Scenarios, code, order, and matching</span>
        </div>
      </div>
      <Button
        className="rounded-xl bg-white text-[#023E8A] hover:bg-cyan-50"
        onClick={onStartNext}
        disabled={!hasNextTask}
      >
        <Play className="mr-1.5 h-4 w-4" />
        Start next task
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
    { id: "in_progress", label: "In progress" },
    { id: "graded", label: "Graded" },
    { id: "locked", label: "Locked" },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f5f9] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === tab.id ? "bg-[#0f172a] text-white" : "text-[#64748b] hover:text-[#0f172a]",
          )}
        >
          {tab.label}
          {counts?.[tab.id] != null ? (
            <span className={cn("ml-1.5 tabular-nums", value === tab.id ? "text-white/80" : "text-[#94a3b8]")}>
              {counts[tab.id]}
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
      const passed = typeof row.passed === "boolean" ? row.passed : isMcqPassed(percentage);
      return {
        id: row.id,
        attemptNumber: index + 1,
        percentage,
        passed,
        label: mcqResultLabel(percentage, passed),
        at: row.submitted_at ?? row.created_at,
        title: row.title,
      };
    });
}

export function AttemptMarksTimeline({
  rows,
  skillName,
}: {
  rows: McqAttemptResultRow[];
  skillName?: string;
}) {
  const items = gradedAttempts(rows);
  if (items.length === 0) {
    return <p className="text-xs text-[#94a3b8]">No graded attempts yet.</p>;
  }

  return (
    <ol className="pt-attempt-timeline">
      {items.map((item, index) => {
        const previous = index > 0 ? items[index - 1].percentage : null;
        const delta = item.percentage != null && previous != null ? item.percentage - previous : null;
        return (
          <li key={item.id} className="pt-attempt-timeline-item">
            <span
              className={cn(
                "pt-attempt-dot",
                item.passed ? "pt-attempt-dot--pass" : "pt-attempt-dot--retry",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-[#0f172a]">
                  {attemptOrdinal(item.attemptNumber)} attempt
                  {skillName ? <span className="font-medium text-[#64748b]"> · {skillName}</span> : null}
                </p>
                <p className={cn("text-xs font-bold tabular-nums", item.passed ? "text-[#059669]" : "text-[#CA8A04]")}>
                  {item.percentage != null ? `${item.percentage}%` : "—"}
                  {item.label ? <span className="ml-1 font-semibold">{item.label}</span> : null}
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-[#64748b]">{formatAttemptDateTime(item.at)}</p>
              {delta != null && delta !== 0 ? (
                <p className={cn("mt-0.5 text-[11px] font-medium", delta > 0 ? "text-[#059669]" : "text-[#CA8A04]")}>
                  {delta > 0 ? "+" : ""}
                  {delta} pts vs {attemptOrdinal(item.attemptNumber - 1)} attempt
                </p>
              ) : null}
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
  const best = attempts.reduce<number | null>((highest, item) => {
    if (item.percentage == null) return highest;
    return highest == null ? item.percentage : Math.max(highest, item.percentage);
  }, null);

  return (
    <div className="learner-stat-card pt-task-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {skillInitials(skill.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-[#0f172a]">{skill.name}</h3>
              {taskState === "COMPLETED" && display.label && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    display.passed ? "bg-[#ecfdf5] text-[#059669]" : "bg-[#fef9c3] text-[#CA8A04]",
                  )}
                >
                  Latest {score != null ? `${score}% · ` : ""}
                  {display.label}
                </span>
              )}
              {attempts.length > 0 && (
                <span className="rounded-full bg-[#f8fafc] px-2 py-0.5 text-[10px] font-semibold text-[#334155] ring-1 ring-[#e2e8f0]">
                  {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
                  {best != null ? ` · best ${best}%` : ""}
                </span>
              )}
              {taskState === "IN_PROGRESS" && (
                <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold text-[#023E8A]">
                  {attempts.length > 0 ? "Retake in progress" : "In progress"}
                </span>
              )}
              {locked && taskState !== "COMPLETED" && taskState !== "IN_PROGRESS" && (
                <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                  Locked
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#64748b]">
              {skill.domain || "General"} · pass {MCQ_PASS_PERCENT}% · retake keeps every earlier score
            </p>
            <p className="mt-0.5 text-[11px] text-[#94a3b8]">
              Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
              {locked && taskState === "NOT_STARTED" ? " · Locked until next credential sync" : ""}
            </p>
            {score != null && taskState === "COMPLETED" && (
              <div className="mt-3 max-w-md">
                <div className="mb-1 flex justify-between text-[10px] text-[#64748b]">
                  <span>Latest score</span>
                  <span className="font-semibold tabular-nums text-[#023E8A]">{score}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${score}%`,
                      backgroundColor: display.passed ? "#059669" : "#CA8A04",
                    }}
                  />
                </div>
              </div>
            )}
            {attempts.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Attempt timeline</p>
                <AttemptMarksTimeline rows={history} />
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-end">
          <MiniBarChart score={best ?? score} />
          <div className="flex flex-wrap gap-2">
            {taskState === "COMPLETED" ? (
              <>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={onView}>
                  View result
                </Button>
                <Button size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onRetake}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Retake task
                </Button>
              </>
            ) : taskState === "IN_PROGRESS" ? (
              <Button size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onStart}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Start again
              </Button>
            ) : (
              <Button
                size="sm"
                className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                onClick={onStart}
                disabled={locked}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                {locked ? "Link evidence" : "Start task"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
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
      <p className="text-sm font-semibold text-[#023E8A]">Attempt timeline</p>
      <p className="mt-1 text-[11px] text-[#94a3b8]">Marks, date, and time for every sitting.</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-[#94a3b8]">No graded attempts yet. Finish a task and it will appear here.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-[#0f172a]">
                  {entry.skillName}
                  <span className="font-medium text-[#64748b]"> · {attemptOrdinal(entry.attemptNumber)} attempt</span>
                </p>
                <p className={cn("text-xs font-bold tabular-nums", entry.passed ? "text-[#059669]" : "text-[#CA8A04]")}>
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
    ["Clock", "One sitting, not per question"],
    ["Pass mark", `${MCQ_PASS_PERCENT}%`],
    ["Retake", "Every score is kept"],
    ["Before submit", "Flag, then review"],
    ["Keyboard", "A–D, arrows, F"],
    ["Based on", "Competency + platform evidence"],
  ] as const;

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Assessment rules</p>
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
                className="flex w-full items-start gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-left hover:border-[#93c5fd]"
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
}: {
  percentage: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  label: string | null;
  passed: boolean | null;
  message?: string | null;
}) {
  const pct = typeof percentage === "number" ? Math.max(0, Math.min(100, percentage)) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const gap = typeof percentage === "number" ? percentage - MCQ_PASS_PERCENT : null;
  const tone = passed ? "#059669" : "#CA8A04";

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
      <div className="flex items-center gap-4">
        <svg className="h-24 w-24 shrink-0 -rotate-90" viewBox="0 0 88 88" aria-hidden>
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
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Score</p>
          <p className="text-3xl font-bold tabular-nums text-[#0f172a]">
            {percentage ?? "—"}
            <span className="text-base font-semibold text-[#64748b]">%</span>
          </p>
          {label ? (
            <p className="text-sm font-semibold" style={{ color: tone }}>{label}</p>
          ) : null}
          {correctCount != null && totalQuestions != null ? (
            <p className="mt-1 text-xs text-[#64748b]">
              {correctCount} of {totalQuestions} correct · pass mark {MCQ_PASS_PERCENT}%
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#64748b]">Pass mark {MCQ_PASS_PERCENT}%</p>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tone }} />
          <span
            className="absolute top-[-3px] h-3.5 w-px bg-[#0f172a]"
            style={{ left: `${MCQ_PASS_PERCENT}%` }}
            title={`Pass mark ${MCQ_PASS_PERCENT}%`}
          />
        </div>
        {gap != null ? (
          <p className="mt-2 text-xs text-[#64748b]">
            {gap >= 0
              ? `${gap} point${gap === 1 ? "" : "s"} above the pass mark.`
              : `${Math.abs(gap)} point${Math.abs(gap) === 1 ? "" : "s"} short of the pass mark.`}
          </p>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-xs text-[#64748b]">{message}</p> : null}
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
      <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoProfile}>
        Go to profile
      </Button>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Eye,
  Play,
  Timer,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeclaredSkill } from "@/lib/sijil-data";
import type { PracticalTaskState } from "@/lib/db/practical-attempts";
import { MCQ_SECONDS_PER_QUESTION } from "@/lib/mcq-tasks";

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
    <div className="mb-5">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#023E8A]">
        <Eye className="h-3 w-3" aria-hidden />
        Evidence-bound assessment
      </p>
      <h1 className="mt-3 text-2xl font-bold text-[#0f172a] sm:text-[1.65rem]">Practical Tasks</h1>
      <div className="mt-3">
        <Button
          className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
          onClick={onStartNext}
          disabled={!hasNextTask}
        >
          <Play className="mr-1.5 h-4 w-4" />
          Start next task
        </Button>
      </div>
    </div>
  );
}

export function PracticalTasksStatsGrid({
  available,
  completed,
  avgScore,
  nextUnlock,
}: {
  available: number;
  completed: number;
  avgScore: number;
  nextUnlock: number;
}) {
  const items = [
    { label: "Available tasks", value: String(available), hint: `Bound to ${available} declared competencies` },
    { label: "Attempts completed", value: String(completed), hint: completed > 0 ? "Graded MCQ attempts" : "No attempts yet" },
    { label: "Average score", value: completed > 0 ? `${avgScore}%` : "—", hint: "Across all graded attempts" },
    { label: "Next unlock", value: `${nextUnlock} task${nextUnlock === 1 ? "" : "s"}`, hint: "Unlocks on next credential sync" },
  ];

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="learner-stat-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-[#023E8A]">{item.value}</p>
          <p className="mt-1 text-[11px] text-[#94a3b8]">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function TaskFilterTabs({
  value,
  onChange,
}: {
  value: TaskFilter;
  onChange: (v: TaskFilter) => void;
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

export function PracticalTaskCard({
  skill,
  index,
  taskState,
  display,
  locked,
  lastDays,
  onStart,
  onResume,
  onView,
}: {
  skill: DeclaredSkill;
  index: number;
  taskState: PracticalTaskState;
  display: TaskCardDisplay;
  locked: boolean;
  lastDays: number | null;
  onStart: () => void;
  onResume: () => void;
  onView: () => void;
}) {
  const color = skillIconColor(index);
  const score = display.percentage;

  return (
    <div className="learner-stat-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
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
                  {score != null ? `${score}% · ` : ""}
                  {display.label}
                </span>
              )}
              {taskState === "IN_PROGRESS" && (
                <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold text-[#023E8A]">
                  In progress
                </span>
              )}
              {locked && taskState !== "COMPLETED" && taskState !== "IN_PROGRESS" && (
                <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                  Locked
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#64748b]">
              {skill.domain} · MCQ practical task · {skill.domain}
            </p>
            <p className="mt-0.5 text-[11px] text-[#94a3b8]">
              Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
              {locked ? " · Locked until next credential sync" : ""}
            </p>
            {score != null && taskState === "COMPLETED" && (
              <div className="mt-3 max-w-md">
                <div className="mb-1 flex justify-between text-[10px] text-[#64748b]">
                  <span>Score</span>
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-end xl:flex-row xl:items-center">
          <MiniBarChart score={score} />
          <div className="flex flex-wrap gap-2">
            {taskState === "COMPLETED" ? (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={onView}>
                View attempt
              </Button>
            ) : taskState === "IN_PROGRESS" ? (
              <Button size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onResume}>
                <Timer className="mr-1 h-3.5 w-3.5" />
                Resume MCQ
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

export type TimelineEvent = {
  id: string;
  label: string;
  tone: "blue" | "yellow" | "green";
  time?: string;
};

export function AttemptTimelinePanel({ events }: { events: TimelineEvent[] }) {
  const toneColor = { blue: "#023E8A", yellow: "#CA8A04", green: "#059669" };

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Attempt timeline</p>
      {events.length === 0 ? (
        <p className="mt-3 text-xs text-[#94a3b8]">No recent attempt activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((ev) => (
            <li key={ev.id} className="flex gap-2.5 text-xs">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: toneColor[ev.tone] }}
              />
              <div>
                <p className="font-medium text-[#334155]">{ev.label}</p>
                {ev.time ? <p className="text-[#94a3b8]">{ev.time}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssessmentRulesPanel() {
  const rules = [
    ["Questions per task", "10 MCQ"],
    ["Time per question", `${MCQ_SECONDS_PER_QUESTION} seconds`],
    ["Delivery", "One at a time"],
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
        Declare a competency on your profile before starting a practical task.
      </p>
      <Button className="mt-4 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onGoProfile}>
        Go to profile
      </Button>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag, LogOut, Send } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { McqCodeStage } from "@/components/practical-tasks/PracticalTasksPagePanels";
import {
  isResponsePresent,
  questionTypeOf,
  type AssessmentAnswerValue,
  type ClosedQuestionType,
  type McqOptionId,
  type McqQuestion,
} from "@/lib/mcq-tasks";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<ClosedQuestionType, string> = {
  single: "Single answer",
  scenario: "Scenario",
  case: "Case study",
  multi: "Multiple response",
  boolean: "True or false",
  "code-output": "Predict the output",
  debug: "Find the bug",
  order: "Build list",
  match: "Matching",
  hotspot: "Select the region",
};

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function optionList(value: AssessmentAnswerValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value) return [value];
  return [];
}

export function AssessmentWorkspace({
  skillName,
  title,
  questions,
  answers,
  currentIndex,
  flaggedIds,
  deadlineAt,
  now,
  evaluating,
  onAnswer,
  onJump,
  onFlag,
  onSubmit,
  onQuit,
}: {
  skillName: string;
  title: string;
  questions: McqQuestion[];
  answers: Record<string, AssessmentAnswerValue | undefined>;
  currentIndex: number;
  flaggedIds: string[];
  deadlineAt: string;
  now: number;
  evaluating: boolean;
  onAnswer: (questionId: string, value: AssessmentAnswerValue | null) => void;
  onJump: (index: number) => void;
  onFlag: (questionId: string) => void;
  onSubmit: () => void;
  onQuit: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [visited, setVisited] = useState<number[]>([currentIndex]);
  const question = questions[currentIndex];
  const remaining = new Date(deadlineAt).getTime() - now;
  const urgent = remaining <= 2 * 60 * 1000;
  const flagged = new Set(flaggedIds);

  useEffect(() => {
    setVisited((current) => current.includes(currentIndex) ? current : [...current, currentIndex]);
  }, [currentIndex]);

  const counts = useMemo(() => {
    let answered = 0;
    questions.forEach((item) => {
      if (isResponsePresent(answers[item.id])) answered += 1;
    });
    return {
      answered,
      unanswered: questions.length - answered,
      flagged: questions.filter((item) => flagged.has(item.id)).length,
    };
  }, [answers, questions, flaggedIds]);

  useEffect(() => {
    if (!question || reviewing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (target?.closest("button, a") && (event.key === "Enter" || event.key === " ")) return;
      const key = event.key.toLowerCase();
      const optionByKey: Record<string, McqOptionId> = {
        a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D",
      };
      const optionId = optionByKey[key];
      const type = questionTypeOf(question);
      if (optionId && question.options.some((option) => option.id === optionId) && type !== "order" && type !== "match") {
        event.preventDefault();
        if (type === "multi") {
          const current = optionList(answers[question.id]);
          const next = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
          onAnswer(question.id, next);
        } else {
          onAnswer(question.id, optionId);
        }
        return;
      }
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        onJump(currentIndex - 1);
      } else if (event.key === "ArrowRight" && currentIndex < questions.length - 1) {
        event.preventDefault();
        onJump(currentIndex + 1);
      } else if (key === "f") {
        event.preventDefault();
        onFlag(question.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, reviewing, answers, currentIndex, questions.length, onAnswer, onJump, onFlag]);

  const navigator = (
    <QuestionNavigator
      questions={questions}
      answers={answers}
      currentIndex={currentIndex}
      flagged={flagged}
      visited={new Set(visited)}
      onJump={(index) => {
        setReviewing(false);
        setNavOpen(false);
        onJump(index);
      }}
    />
  );

  const progress = questions.length > 0 ? Math.round((counts.answered / questions.length) * 100) : 0;
  const selection = question ? selectionLabel(question, answers[question.id]) : "No question open";

  return (
    <div className="exam-shell fixed inset-0 z-50 flex flex-col bg-[hsl(var(--sijil-blue)/0.06)] text-[#0f172a]">
      <header className="border-b border-[hsl(var(--sijil-blue)/0.14)] bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <img src={sijilLogo} alt="SIJIL" className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sijil-blue">{title || "Practical assessment"}</p>
            <p className="truncate text-xs text-[#64748b]">{skillName}</p>
          </div>
          <div className="hidden min-w-[9rem] sm:block">
            <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              <span>{counts.answered}/{questions.length} answered</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div className="h-full rounded-full bg-sijil-blue transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <p className="hidden text-xs font-medium text-[#64748b] md:block">
            {reviewing ? "Review" : `Question ${currentIndex + 1} of ${questions.length}`}
          </p>
          <p className={cn("mono rounded-lg px-3 py-1.5 text-sm font-semibold", urgent ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[hsl(var(--sijil-blue)/0.04)] text-sijil-blue")} aria-live="polite">
            {formatClock(remaining)}
          </p>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setQuitting(true)}
            disabled={evaluating}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Quit
          </Button>
          <Button className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={() => setReviewing(true)} disabled={evaluating}>
            Finish
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
          {reviewing ? (
            <ReviewPane
              questions={questions}
              answers={answers}
              flagged={flagged}
              counts={counts}
              onJump={(index) => {
                setReviewing(false);
                onJump(index);
              }}
              onConfirm={() => setConfirming(true)}
              evaluating={evaluating}
            />
          ) : question ? (
            <article className="exam-stage">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sijil-blue px-2.5 py-1 text-[11px] font-semibold text-white">
                  Q{currentIndex + 1}
                </span>
                <span className="rounded-full bg-[hsl(var(--sijil-blue)/0.04)] px-2.5 py-1 text-[11px] font-semibold text-sijil-blue">
                  {TYPE_LABEL[questionTypeOf(question)]}
                </span>
                <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-medium capitalize text-[#64748b]">
                  {question.difficulty}
                </span>
                {question.caseTitle ? (
                  <span className="rounded-full bg-[#f0fdfa] px-2.5 py-1 text-[11px] font-semibold text-[#0f766e]">
                    {question.caseTitle}
                  </span>
                ) : null}
                <span className={cn(
                  "ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  isResponsePresent(answers[question.id]) ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#f8fafc] text-[#64748b]",
                )}>
                  {isResponsePresent(answers[question.id]) ? "Answered" : "Waiting for an answer"}
                </span>
              </div>
              <QuestionBody
                question={question}
                value={answers[question.id]}
                onChange={(value) => onAnswer(question.id, value)}
              />
              <div className="exam-stage-status">
                <p className="min-w-0 truncate text-sm">
                  <span className="font-semibold text-[#0f172a]">Your choice. </span>
                  <span className="text-[#475569]">{selection}</span>
                </p>
                <p className="shrink-0 text-[11px] text-[#94a3b8]">
                  {questionTypeOf(question) === "order" || questionTypeOf(question) === "match"
                    ? "Arrange the answer, then continue"
                    : "Click a choice, or press A–D"}
                </p>
              </div>
            </article>
          ) : null}
        </main>
        <aside className="exam-rail hidden lg:flex">
          <div>
            <div className="flex items-end justify-between">
              <p className="text-sm font-semibold text-sijil-blue">Sitting progress</p>
              <p className="text-xs font-bold tabular-nums text-[#0f172a]">{progress}%</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ["Answered", counts.answered, "text-[#047857]"],
                ["Open", counts.unanswered, "text-sijil-blue"],
                ["Flagged", counts.flagged, "text-[#a16207]"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-xl bg-[#f8fafc] px-2 py-2 text-center ring-1 ring-[#e2e8f0]">
                  <p className={cn("text-lg font-bold tabular-nums", String(tone))}>{value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-sijil-blue">Questions</p>
            <div className="mt-3">{navigator}</div>
          </div>
          <div className="mt-auto rounded-xl bg-[#f8fafc] p-3 ring-1 ring-[#e2e8f0]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              {reviewing ? "Reviewing" : `Now on question ${currentIndex + 1}`}
            </p>
            <p className="mt-1 text-sm font-medium text-[#0f172a]">{selection}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold text-[#475569]">
              <span className="exam-key">A–D</span>
              <span>select</span>
              <span className="exam-key">← →</span>
              <span>move</span>
              <span className="exam-key">F</span>
              <span>flag</span>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--sijil-blue)/0.14)] bg-white px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="rounded-xl lg:hidden">Questions</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Questions</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{navigator}</div>
            </SheetContent>
          </Sheet>
          {question && !reviewing ? (
            <>
              <Button variant="outline" className="rounded-xl" onClick={() => onFlag(question.id)}>
                <Flag className={cn("mr-1.5 h-3.5 w-3.5", flagged.has(question.id) && "fill-[#CA8A04] text-[#CA8A04]")} />
                {flagged.has(question.id) ? "Flagged" : "Mark for review"}
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => onAnswer(question.id, null)} disabled={!isResponsePresent(answers[question.id])}>
                Clear response
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" disabled={reviewing || currentIndex === 0} onClick={() => onJump(currentIndex - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          {reviewing ? (
            <Button variant="outline" className="rounded-xl" onClick={() => setReviewing(false)}>Back to question</Button>
          ) : currentIndex >= questions.length - 1 ? (
            <Button className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={() => setReviewing(true)}>Review</Button>
          ) : (
            <Button className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" onClick={() => onJump(currentIndex + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this assessment?</DialogTitle>
            <DialogDescription>
              {counts.unanswered > 0
                ? `${counts.unanswered} question${counts.unanswered === 1 ? " is" : "s are"} still unanswered and will be marked incorrect.`
                : "Every question has a response. You can still go back before the timer ends."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirming(false)}>Keep working</Button>
            <Button className="rounded-xl bg-sijil-blue hover:bg-sijil-blue" disabled={evaluating} onClick={() => { setConfirming(false); onSubmit(); }}>
              {evaluating ? "Submitting…" : "Submit assessment"}
              <Send className="ml-1.5 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quitting} onOpenChange={setQuitting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quit this sitting?</DialogTitle>
            <DialogDescription>
              This attempt will be discarded. You will not resume from here. Next time the quiz starts from the beginning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setQuitting(false)}>Keep working</Button>
            <Button
              className="rounded-xl bg-sijil-blue hover:bg-sijil-blue"
              disabled={evaluating}
              onClick={() => {
                setQuitting(false);
                onQuit();
              }}
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Quit and start later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionNavigator({
  questions,
  answers,
  currentIndex,
  flagged,
  visited,
  onJump,
}: {
  questions: McqQuestion[];
  answers: Record<string, AssessmentAnswerValue | undefined>;
  currentIndex: number;
  flagged: Set<string>;
  visited: Set<number>;
  onJump: (index: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((item, index) => {
          const answered = isResponsePresent(answers[item.id]);
          const isFlagged = flagged.has(item.id);
          const state = index === currentIndex
            ? "current"
            : isFlagged
              ? "flagged"
              : answered
                ? "answered"
                : visited.has(index)
                  ? "visited"
                  : "new";
          return (
            <button
              key={item.id}
              type="button"
              className={cn("exam-nav", `exam-nav--${state}`)}
              aria-current={index === currentIndex ? "step" : undefined}
              aria-label={`Question ${index + 1}, ${state}`}
              onClick={() => onJump(index)}
            >
              {index + 1}
              {answered ? <Check className="exam-nav-mark" aria-hidden /> : null}
              {isFlagged ? <Flag className="exam-nav-mark" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-medium text-[#64748b]">
        <span className="inline-flex items-center gap-1.5"><i className="exam-legend exam-legend--current" /> Current</span>
        <span className="inline-flex items-center gap-1.5"><i className="exam-legend exam-legend--answered" /> Answered</span>
        <span className="inline-flex items-center gap-1.5"><i className="exam-legend exam-legend--flagged" /> Flagged</span>
        <span className="inline-flex items-center gap-1.5"><i className="exam-legend exam-legend--visited" /> Seen</span>
      </div>
    </div>
  );
}

function ReviewPane({
  questions,
  answers,
  flagged,
  counts,
  onJump,
  onConfirm,
  evaluating,
}: {
  questions: McqQuestion[];
  answers: Record<string, AssessmentAnswerValue | undefined>;
  flagged: Set<string>;
  counts: { answered: number; unanswered: number; flagged: number };
  onJump: (index: number) => void;
  onConfirm: () => void;
  evaluating: boolean;
}) {
  return (
    <div className="exam-stage overflow-y-auto">
      <h2 className="text-xl font-semibold text-sijil-blue">Review before you finish</h2>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Answered", counts.answered],
          ["Unanswered", counts.unanswered],
          ["Flagged", counts.flagged],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
            <p className="text-2xl font-bold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {questions.map((item, index) => (
          <li key={item.id}>
            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-left" onClick={() => onJump(index)}>
              <span className="text-sm font-medium">{index + 1}. {TYPE_LABEL[questionTypeOf(item)]}</span>
              <span className="text-xs text-[#64748b]">
                {flagged.has(item.id) ? "Flagged" : isResponsePresent(answers[item.id]) ? "Answered" : "Unanswered"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-4 rounded-xl bg-sijil-blue hover:bg-sijil-blue" disabled={evaluating} onClick={onConfirm}>
        Submit assessment
      </Button>
    </div>
  );
}

function selectionLabel(question: McqQuestion, value: AssessmentAnswerValue | undefined): string {
  if (!isResponsePresent(value)) return "Nothing selected yet";
  const type = questionTypeOf(question);
  if (type === "order") return "Step order updated";
  if (type === "match") {
    const count = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
    return `${count} match${count === 1 ? "" : "es"} set`;
  }
  if (Array.isArray(value)) {
    const labels = value.map((id) => {
      const option = question.options.find((item) => item.id === id);
      return option ? `${option.id}. ${option.text}` : String(id);
    });
    return labels.join(" · ");
  }
  if (typeof value === "string") {
    const option = question.options.find((item) => item.id === value);
    return option ? `${option.id}. ${option.text}` : value;
  }
  return "Answer selected";
}

function usesChoiceGrid(question: McqQuestion): boolean {
  const type = questionTypeOf(question);
  if (type === "order" || type === "match" || type === "hotspot") return false;
  if (question.options.length < 2 || question.options.length > 6) return false;
  return question.options.every((option) => option.text.length <= 80);
}

function QuestionBody({
  question,
  value,
  onChange,
}: {
  question: McqQuestion;
  value: AssessmentAnswerValue | undefined;
  onChange: (value: AssessmentAnswerValue | null) => void;
}) {
  const type = questionTypeOf(question);
  const selected = typeof value === "string" ? value : "";
  const many = optionList(value);
  const grid = usesChoiceGrid(question);

  return (
    <div className="exam-question">
      {question.scenario ? (
        <section className="rounded-xl border border-[hsl(var(--sijil-blue)/0.14)] bg-[#f8fafc] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
            {type === "case" ? "Case" : "Scenario"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#334155]">{question.scenario}</p>
        </section>
      ) : null}
      <h2 className="text-xl font-semibold leading-snug text-[#0f172a]">{question.question}</h2>
      {question.selectionNote ? <p className="text-xs text-[#64748b]">{question.selectionNote}</p> : null}
      {(type === "code-output" || type === "debug") && question.code ? (
        <McqCodeStage code={question.code} language={question.language} />
      ) : null}
      {type === "hotspot" ? (
        <div className="exam-options exam-options--grid">
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn("exam-region", selected === option.id && "exam-region--selected")}
              onClick={() => onChange(option.id)}
            >
              <span className="text-[10px] font-bold text-[#64748b]">{option.id}</span>
              <span className="mt-1 block text-sm font-semibold">{option.text}</span>
            </button>
          ))}
        </div>
      ) : null}
      {type === "order" && question.orderItems ? (
        <OrderList
          questionId={question.id}
          items={question.orderItems}
          order={Array.isArray(value) ? value.map(String) : null}
          onChange={(order) => onChange(order)}
        />
      ) : null}
      {type === "match" && question.matchLeft && question.matchRight ? (
        <MatchList
          left={question.matchLeft}
          right={question.matchRight}
          pairs={value && typeof value === "object" && !Array.isArray(value) ? value : {}}
          onChange={(pairs) => onChange(Object.keys(pairs).length ? pairs : null)}
        />
      ) : null}
      {type !== "order" && type !== "match" && type !== "hotspot" ? (
        <div className={cn("exam-options", grid && "exam-options--grid")}>
          {question.options.map((option, index) => {
            const checked = type === "multi" ? many.includes(option.id) : selected === option.id;
            const wide = grid && question.options.length % 2 === 1 && index === question.options.length - 1;
            return (
              <button
                key={option.id}
                type="button"
                className={cn("exam-option", checked && "exam-option--selected", wide && "exam-option--wide")}
                aria-pressed={checked}
                onClick={() => {
                  if (type === "multi") {
                    const next = checked ? many.filter((id) => id !== option.id) : [...many, option.id];
                    onChange(next.length ? next : null);
                  } else {
                    onChange(option.id);
                  }
                }}
              >
                <span className="exam-option-mark">{type === "multi" ? (checked ? "✓" : option.id) : option.id}</span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-[#1e293b]">{option.text}</span>
                <span className={cn("exam-option-state", checked && "exam-option-state--on")}>
                  {checked ? <Check className="h-3.5 w-3.5" /> : "Select"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function shuffledIds(items: { id: string }[], seed: string): string[] {
  const ids = items.map((item) => item.id);
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    hash = Math.imul(hash, 1664525) + 1013904223;
    const swap = (hash >>> 0) % (index + 1);
    const current = ids[index];
    ids[index] = ids[swap];
    ids[swap] = current;
  }
  if (ids.every((id, index) => id === items[index]?.id) && ids.length > 1) {
    const first = ids[0];
    ids[0] = ids[1];
    ids[1] = first;
  }
  return ids;
}

function OrderList({
  questionId,
  items,
  order,
  onChange,
}: {
  questionId: string;
  items: { id: string; text: string }[];
  order: string[] | null;
  onChange: (order: string[]) => void;
}) {
  const shown = order ?? shuffledIds(items, questionId);
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = shown.map((id) => byId.get(id)).filter((item): item is { id: string; text: string } => Boolean(item));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...shown];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!order ? <p className="mb-2 text-xs text-[#64748b]">Move the steps into the correct order. The list is not scored until you move one.</p> : null}
      <ol className="exam-options">
        {rows.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2">
            <span className="w-5 text-xs font-bold text-[#64748b]">{index + 1}</span>
            <span className="flex-1 text-sm">{item.text}</span>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={`Move ${item.text} up`} disabled={index === 0} onClick={() => move(index, -1)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={`Move ${item.text} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchList({
  left,
  right,
  pairs,
  onChange,
}: {
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
}) {
  return (
    <div className="exam-options">
      {left.map((item) => (
        <div key={item.id} className="grid items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 sm:grid-cols-[1fr_220px]">
          <span className="text-sm font-medium">{item.text}</span>
          <Select value={pairs[item.id]} onValueChange={(next) => onChange({ ...pairs, [item.id]: next })}>
            <SelectTrigger aria-label={`Match for ${item.text}`}>
              <SelectValue placeholder="Select a match" />
            </SelectTrigger>
            <SelectContent>
              {right.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.text}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

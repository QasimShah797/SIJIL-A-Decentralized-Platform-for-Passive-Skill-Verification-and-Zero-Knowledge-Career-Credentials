import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton, CardSkeleton } from "@/components/sijil/SkeletonLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Play, Lock, Send, RefreshCcw, ChevronRight, ChevronLeft, Flag, Search, RotateCcw, ListOrdered } from "lucide-react";
import { daysSince, type DeclaredSkill, type AttemptRecord } from "@/lib/sijil-data";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useAuth } from "@/hooks/useAuth";
import { useGitHub } from "@/hooks/useGitHub";
import {
  AttemptMarksTimeline,
  AttemptTimelinePanel,
  EmptyTasksPanel,
  gradedAttempts,
  McqCodeStage,
  McqOptionButton,
  McqQuestionPalette,
  McqReviewList,
  McqScoreSummary,
  PracticalTasksFooter,
  PracticalTasksHero,
  PracticalTaskCard,
  RetakeIntroBanner,
  TaskDetailsGrid,
  TaskFilterTabs,
  type AttemptHistoryEntry,
  type TaskFilter,
} from "@/components/practical-tasks/PracticalTasksPagePanels";
import { AssessmentWorkspace } from "@/components/practical-tasks/AssessmentWorkspace";
import {
  loadAttemptsWithMcqResults,
  saveAttemptDb,
  fetchLatestMcqAttemptResult,
  fetchLatestCompletedMcqAttemptResult,
  fetchMcqAttemptHistories,
  fetchMcqAttemptHistory,
  derivePracticalTaskState,
  mcqResultToAttemptRecord,
  isMcqRowCompleted,
  isAttemptLocked,
  type McqAttemptResultRow,
  type PracticalTaskState,
} from "@/lib/db/practical-attempts";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  createInitialMcqProgress,
  MCQ_SITTING_SECONDS,
  evaluateSecureMcqAttempt,
  generateSecureMcqTask,
  buildMcqSubmissionAnswers,
  isMcqPassed,
  isResponsePresent,
  secondsForQuestion,
  type AssessmentAnswerValue,
  mcqResultLabel,
  parseMcqAnswers,
  parseMcqProgress,
  parseMcqSession,
  restoreMcqTaskFromSubmission,
  serializeMcqSession,
  type McqAnswerMap,
  type McqOptionId,
  type McqTask,
} from "@/lib/mcq-tasks";

const NO_COPY_PROPS = {
  className: "select-none",
  style: { WebkitUserSelect: "none" as const, userSelect: "none" as const },
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
};

type StoredPracticalTaskState = {
  task: McqTask | null;
  attempt: AttemptRecord | null;
  answers: McqAnswerMap;
  currentQuestionIndex: number;
  questionEndsAt: string | null;
  resultPercentage: number | null;
  resultCorrectCount: number | null;
  resultTotalQuestions: number | null;
  resultMessage: string | null;
  resultLabel: string | null;
  passed: boolean | null;
  submitted: boolean;
  flaggedIds?: string[];
  maxVisitedIndex?: number;
};

function practicalTaskStorageKey(userId: string, skillId: string) {
  return `sijil-practical-task-${userId}-${skillId}`;
}

function genAttemptId() {
  return `att-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function TimerProgressRing({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  const offset = circumference * (1 - progress);
  const urgent = remainingMs <= 10_000;

  return (
    <svg className="pt-mcq-timer-ring h-9 w-9 shrink-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="3" className="stroke-white/25" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={urgent ? "stroke-red-400" : "stroke-cyan-300"}
      />
    </svg>
  );
}

async function invokeRapidTask(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("rapid-task", { body });
  if (!error) {
    return {
      data: (data as Record<string, unknown> | null) ?? null,
      error: null,
    };
  }

  let message = error.message || "Edge Function returned a non-2xx status code";
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json() as { error?: unknown; details?: unknown };
      const fnError = payload?.error != null ? String(payload.error) : "";
      const details = payload?.details != null ? String(payload.details) : "";
      if (fnError && details) message = `${fnError}: ${details}`;
      else if (fnError) message = fnError;
    } catch {
      // keep the SDK message when the function body is not JSON
    }
  }

  return {
    data: (data as Record<string, unknown> | null) ?? null,
    error: new Error(message),
  };
}

function restoreFromAttemptRecord(existing: AttemptRecord) {
  const restoredTask = restoreMcqTaskFromSubmission(existing.submission ?? "");
  const session = parseMcqSession(existing.submission ?? "");
  const progress = parseMcqProgress(existing.submission ?? "");
  const submitted = existing.status === "submitted"
    || existing.status === "auto_submitted"
    || existing.status === "passed";
  const resultPercentage = session?.resultPercentage ?? existing.score ?? null;
  const nextPassed = session?.passed ?? (resultPercentage != null
    ? isMcqPassed(resultPercentage)
    : existing.passed ?? (existing.status === "passed" ? true : null));

  return {
    task: restoredTask,
    attempt: existing,
    answers: progress?.answers ?? parseMcqAnswers(existing.submission ?? ""),
    currentQuestionIndex: progress?.currentIndex ?? 0,
    questionEndsAt: progress?.questionEndsAt ?? null,
    resultPercentage,
    resultCorrectCount: session?.resultCorrectCount ?? null,
    resultTotalQuestions: session?.resultTotalQuestions ?? null,
    resultMessage: session?.resultMessage ?? existing.feedback ?? null,
    resultLabel: session?.resultLabel ?? mcqResultLabel(resultPercentage, nextPassed),
    passed: nextPassed,
    submitted,
  };
}

function formatAttemptDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type PanelMode = "start" | "mcq" | "result";

function getSkillMcqDisplay(
  skillId: string,
  attemptsMap: Record<string, AttemptRecord>,
  mcqResultsMap: Record<string, McqAttemptResultRow>,
) {
  const mcq = mcqResultsMap[skillId] ?? null;
  const attempt = attemptsMap[skillId] ?? null;
  const percentage = typeof mcq?.percentage === "number"
    ? mcq.percentage
    : attempt?.score ?? null;
  const passed = typeof mcq?.passed === "boolean"
    ? mcq.passed
    : isMcqPassed(percentage);
  const label = mcqResultLabel(percentage, passed);
  const submittedAt = mcq?.submitted_at ?? attempt?.endsAt ?? null;
  return { percentage, passed, label, submittedAt };
}

export default function PracticalTask() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const { repos } = useGitHub();
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [attemptsMap, setAttemptsMap] = useState<Record<string, AttemptRecord>>({});
  const [mcqResultsMap, setMcqResultsMap] = useState<Record<string, McqAttemptResultRow>>({});
  const [historyMap, setHistoryMap] = useState<Record<string, McqAttemptResultRow[]>>({});
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const attemptsLoadedRef = useRef(false);
  const attemptsSkillKeyRef = useRef("");

  useEffect(() => {
    if (!userId) {
      attemptsLoadedRef.current = false;
      attemptsSkillKeyRef.current = "";
      return;
    }

    const skillKey = skills.map((s) => s.id).join(",");
    if (attemptsLoadedRef.current && attemptsSkillKeyRef.current === skillKey) {
      return;
    }

    attemptsSkillKeyRef.current = skillKey;
    const skillIds = skills.map((s) => s.id);
    Promise.all([
      loadAttemptsWithMcqResults(userId, skillIds),
      fetchMcqAttemptHistories(userId, skillIds),
    ]).then(([{ attempts, mcqResults }, histories]) => {
      setAttemptsMap(attempts);
      setMcqResultsMap(mcqResults);
      setHistoryMap(histories);
      attemptsLoadedRef.current = true;
    });
  }, [userId, skills]);

  useEffect(() => {
    if (!userId) return;
    for (const [skillId, mcqResult] of Object.entries(mcqResultsMap)) {
      if (isMcqRowCompleted(mcqResult)) {
        localStorage.removeItem(practicalTaskStorageKey(userId, skillId));
      }
    }
  }, [userId, mcqResultsMap]);

  const getAttempt = useCallback((skillId: string) => attemptsMap[skillId] ?? null, [attemptsMap]);
  const saveAttempt = useCallback(async (rec: AttemptRecord) => {
    if (!userId) return;
    await saveAttemptDb(userId, rec);
    setAttemptsMap((m) => ({ ...m, [rec.skillId]: rec }));
  }, [userId]);

  const [activeSkill, setActiveSkill] = useState<DeclaredSkill | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("start");
  const [task, setTask] = useState<McqTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [generatingMcqs, setGeneratingMcqs] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [answers, setAnswers] = useState<McqAnswerMap>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionEndsAt, setQuestionEndsAt] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [resultPercentage, setResultPercentage] = useState<number | null>(null);
  const [resultCorrectCount, setResultCorrectCount] = useState<number | null>(null);
  const [resultTotalQuestions, setResultTotalQuestions] = useState<number | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string | null>(null);
  const [passed, setPassed] = useState<boolean | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);
  const [quizView, setQuizView] = useState<"question" | "review">("question");
  const [skillQuery, setSkillQuery] = useState("");
  const [attemptHistory, setAttemptHistory] = useState<McqAttemptResultRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);
  const advancingRef = useRef(false);

  const storageKey = userId && activeSkill?.id
    ? practicalTaskStorageKey(userId, activeSkill.id)
    : null;

  const isSubmitted = attempt && (
    attempt.status === "submitted"
    || attempt.status === "auto_submitted"
    || attempt.status === "passed"
  );

  const applyStoredState = useCallback((stored: StoredPracticalTaskState) => {
    if (stored.task) setTask(stored.task);
    if (stored.attempt) setAttempt(stored.attempt);
    if (stored.answers) setAnswers(stored.answers);
    if (typeof stored.currentQuestionIndex === "number") {
      setCurrentQuestionIndex(stored.currentQuestionIndex);
    }
    if (stored.questionEndsAt) setQuestionEndsAt(stored.questionEndsAt);
    if (typeof stored.resultPercentage === "number") setResultPercentage(stored.resultPercentage);
    if (typeof stored.resultCorrectCount === "number") setResultCorrectCount(stored.resultCorrectCount);
    if (typeof stored.resultTotalQuestions === "number") setResultTotalQuestions(stored.resultTotalQuestions);
    if (stored.resultMessage) setResultMessage(stored.resultMessage);
    if (stored.resultLabel) setResultLabel(stored.resultLabel);
    if (typeof stored.passed === "boolean") setPassed(stored.passed);
    setFlaggedIds(Array.isArray(stored.flaggedIds) ? stored.flaggedIds : []);
    setMaxVisitedIndex(
      typeof stored.maxVisitedIndex === "number"
        ? stored.maxVisitedIndex
        : (typeof stored.currentQuestionIndex === "number" ? stored.currentQuestionIndex : 0),
    );
    setQuizView("question");
  }, []);

  const hydratePracticalTaskState = useCallback((skillId: string, allowInProgress = true): boolean => {
    if (!userId || !allowInProgress) return false;
    const saved = localStorage.getItem(practicalTaskStorageKey(userId, skillId));
    if (!saved) return false;

    try {
      const parsed = JSON.parse(saved) as StoredPracticalTaskState;
      applyStoredState(parsed);
      return Boolean(parsed.task || parsed.attempt);
    } catch (error) {
      console.warn("Could not restore practical task state:", error);
      return false;
    }
  }, [applyStoredState, userId]);

  const resetPracticalTaskState = useCallback((skillId?: string) => {
    setTask(null);
    setAttempt(null);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setQuestionEndsAt(null);
    setResultPercentage(null);
    setResultCorrectCount(null);
    setResultTotalQuestions(null);
    setResultMessage(null);
    setResultLabel(null);
    setPassed(null);
    setShowResultModal(false);
    setFlaggedIds([]);
    setMaxVisitedIndex(0);
    setQuizView("question");
    setGenerateError(null);

    if (userId) {
      const key = skillId
        ? practicalTaskStorageKey(userId, skillId)
        : storageKey;
      if (key) localStorage.removeItem(key);
    }
  }, [storageKey, userId]);

  const syncAttemptResultFromServer = useCallback(async (
    skillId: string,
    existing: AttemptRecord,
  ) => {
    if (!userId) return;

    const remote = await fetchLatestMcqAttemptResult(userId, skillId);
    if (!remote) return;

    const nextPercentage = typeof remote.percentage === "number" ? remote.percentage : existing.score ?? null;
    const nextCorrectCount = typeof remote.correct_count === "number" ? remote.correct_count : null;
    const nextTotalQuestions = typeof remote.total_questions === "number" ? remote.total_questions : null;
    const nextPassed = nextPercentage != null
      ? isMcqPassed(nextPercentage)
      : (typeof remote.passed === "boolean" ? remote.passed : existing.passed ?? null);
    const nextLabel = mcqResultLabel(nextPercentage, nextPassed);

    setResultPercentage(nextPercentage);
    setResultCorrectCount(nextCorrectCount);
    setResultTotalQuestions(nextTotalQuestions);
    setResultLabel(nextLabel);
    setPassed(nextPassed);

    const session = parseMcqSession(existing.submission ?? "");
    const nextSubmission = session
      ? serializeMcqSession({
          ...session,
          resultPercentage: nextPercentage ?? undefined,
          resultCorrectCount: nextCorrectCount ?? undefined,
          resultTotalQuestions: nextTotalQuestions ?? undefined,
          resultLabel: nextLabel ?? undefined,
          passed: nextPassed ?? undefined,
        })
      : existing.submission;

    const nextStatus: AttemptRecord["status"] = nextPassed === true
      ? "passed"
      : nextPercentage != null
        ? "submitted"
        : existing.status;

    if (
      nextPercentage === (existing.score ?? null)
      && nextPassed === (existing.passed ?? null)
      && nextSubmission === existing.submission
      && nextStatus === existing.status
    ) {
      return;
    }

    const syncedAttempt: AttemptRecord = {
      ...existing,
      status: nextStatus,
      passed: nextPassed ?? existing.passed,
      score: nextPercentage ?? existing.score,
      submission: nextSubmission ?? existing.submission,
    };

    await saveAttempt(syncedAttempt);
    setAttempt(syncedAttempt);
  }, [saveAttempt, userId]);

  useEffect(() => {
    if (!storageKey) return;

    const payload: StoredPracticalTaskState = {
      task,
      attempt,
      answers,
      currentQuestionIndex,
      questionEndsAt,
      resultPercentage,
      resultCorrectCount,
      resultTotalQuestions,
      resultMessage,
      resultLabel,
      passed,
      submitted: Boolean(isSubmitted),
      flaggedIds,
      maxVisitedIndex,
    };

    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    storageKey,
    task,
    attempt,
    answers,
    currentQuestionIndex,
    questionEndsAt,
    resultPercentage,
    resultCorrectCount,
    resultTotalQuestions,
    resultMessage,
    resultLabel,
    passed,
    isSubmitted,
    flaggedIds,
    maxVisitedIndex,
  ]);

  const loadAttemptHistory = useCallback(async (skillId: string) => {
    if (!userId) {
      setAttemptHistory([]);
      return;
    }
    const history = await fetchMcqAttemptHistory(userId, skillId);
    setAttemptHistory(history);
    setHistoryMap((current) => ({ ...current, [skillId]: history }));
  }, [userId]);

  const currentQuestion = task?.questions[currentQuestionIndex] ?? null;
  const isLastQuestion = task ? currentQuestionIndex >= task.questions.length - 1 : false;
  const isFirstQuestion = currentQuestionIndex === 0;
  const currentAnswerSelected = currentQuestion ? answers[currentQuestion.id] != null : false;
  const answeredCount = task ? task.questions.filter((question) => answers[question.id]).length : 0;
  const flaggedSet = useMemo(() => new Set(flaggedIds), [flaggedIds]);
  const answeredSet = useMemo(
    () => new Set(Object.keys(answers).filter((id) => answers[id])),
    [answers],
  );

  const questionRemainingMs = useMemo(() => {
    if (!questionEndsAt || attempt?.status !== "in_progress") return 0;
    return new Date(questionEndsAt).getTime() - now;
  }, [questionEndsAt, now, attempt?.status]);

  const persistProgress = useCallback(async (
    rec: AttemptRecord,
    currentTask: McqTask,
    nextAnswers: McqAnswerMap,
    nextIndex: number,
    nextQuestionEndsAt: string,
  ) => {
    const { attemptId, ...taskBody } = currentTask;
    const updated: AttemptRecord = {
      ...rec,
      submission: serializeMcqSession({
        _mcqSession: true,
        attemptId,
        task: taskBody,
        progress: {
          answers: nextAnswers,
          currentIndex: nextIndex,
          questionEndsAt: nextQuestionEndsAt,
        },
      }),
    };
    await saveAttempt(updated);
    setAttempt(updated);
    setAnswers(nextAnswers);
    setCurrentQuestionIndex(nextIndex);
    setQuestionEndsAt(nextQuestionEndsAt);
  }, [saveAttempt]);

  const submitMcqAttempt = useCallback(async (answersOverride?: McqAnswerMap) => {
    if (!task || !attempt || !activeSkill || !userId) return;

    setEvaluating(true);
    try {
      const submissionAnswers = buildMcqSubmissionAnswers(task, answersOverride ?? answers);
      const result = await evaluateSecureMcqAttempt(task.attemptId, submissionAnswers, invokeRapidTask);
      const priorAttempts = gradedAttempts(historyMap[activeSkill.id] ?? []).length;
      const attemptNumber = priorAttempts + 1;
      const nextPassed = isMcqPassed(result.percentage);
      const nextResultLabel =
        mcqResultLabel(result.percentage, nextPassed, attemptNumber) ??
        (attemptNumber > 1 ? "Retake" : "Completed");
      const walletMessage = attemptNumber > 1
        ? "Retake saved. Latest marks replaced the previous score and the skill stays on the next step."
        : "Task completed. Marks were saved and this competency can continue to the next step.";
      setResultPercentage(result.percentage);
      setResultCorrectCount(result.correctCount);
      setResultTotalQuestions(result.totalQuestions);
      setResultMessage(walletMessage);
      setResultLabel(nextResultLabel);
      setPassed(nextPassed);

      const { attemptId, ...taskBody } = task;
      const evaluatedAttempt: AttemptRecord = {
        ...attempt,
        status: nextPassed ? "passed" : "submitted",
        passed: nextPassed,
        score: result.percentage,
        feedback: walletMessage,
        submission: serializeMcqSession({
          _mcqSession: true,
          attemptId,
          task: taskBody,
          progress: {
            answers: submissionAnswers,
            currentIndex: currentQuestionIndex,
            questionEndsAt: questionEndsAt ?? new Date().toISOString(),
          },
          resultPercentage: result.percentage,
          resultCorrectCount: result.correctCount,
          resultTotalQuestions: result.totalQuestions,
          resultMessage: walletMessage,
          resultLabel: nextResultLabel,
          passed: nextPassed,
        }),
      };

      await saveAttempt(evaluatedAttempt);
      setAttempt(evaluatedAttempt);
      setAttemptsMap((m) => ({ ...m, [activeSkill.id]: evaluatedAttempt }));

      const completedRow: McqAttemptResultRow = {
        id: task.attemptId,
        skill_id: activeSkill.id,
        competency_name: activeSkill.name,
        competency_domain: activeSkill.domain ?? "General",
        title: task.title,
        status: "completed",
        percentage: result.percentage,
        correct_count: result.correctCount,
        total_questions: result.totalQuestions,
        passed: nextPassed,
        submitted_at: new Date().toISOString(),
        created_at: attempt.startedAt,
      };
      setMcqResultsMap((m) => ({ ...m, [activeSkill.id]: completedRow }));
      setHistoryMap((current) => {
        const previous = current[activeSkill.id] ?? [];
        const withoutCurrent = previous.filter((row) => row.id !== completedRow.id);
        return { ...current, [activeSkill.id]: [...withoutCurrent, completedRow] };
      });

      if (userId) {
        localStorage.removeItem(practicalTaskStorageKey(userId, activeSkill.id));
      }

      await loadAttemptHistory(activeSkill.id);
      setPanelMode("result");
      setShowResultModal(true);

      toast({
        title: nextResultLabel,
        description: walletMessage,
      });

      refresh();
    } catch (err) {
      toast({
        title: "Could not submit MCQ",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setEvaluating(false);
    }
  }, [task, attempt, activeSkill, userId, answers, currentQuestionIndex, questionEndsAt, saveAttempt, loadAttemptHistory]);

  const advanceQuestion = useCallback(async (timedOut = false) => {
    if (advancingRef.current || !task || !attempt || !activeSkill || attempt.status !== "in_progress") {
      return;
    }
    advancingRef.current = true;

    try {
      if (isLastQuestion) return;

      const nextIndex = currentQuestionIndex + 1;
      setMaxVisitedIndex((visited) => Math.max(visited, nextIndex));
      await persistProgress(attempt, task, answers, nextIndex, attempt.endsAt);
      setNow(Date.now());
      void timedOut;
    } finally {
      advancingRef.current = false;
    }
  }, [task, attempt, activeSkill, currentQuestionIndex, answers, isLastQuestion, persistProgress, submitMcqAttempt]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [attempt?.attemptId, attempt?.status]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.endsAt) return;
    const remaining = new Date(attempt.endsAt).getTime() - Date.now();
    if (remaining <= MCQ_SITTING_SECONDS * 1000 + 1500) return;
    const next = {
      ...attempt,
      endsAt: new Date(Date.now() + MCQ_SITTING_SECONDS * 1000).toISOString(),
    };
    setAttempt(next);
    void saveAttempt(next);
  }, [attempt, saveAttempt]);

  const expireSubmitRef = useRef(false);
  useEffect(() => {
    expireSubmitRef.current = false;
  }, [attempt?.attemptId]);
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !task || !attempt.endsAt) return;
    if (now < new Date(attempt.endsAt).getTime()) return;
    if (expireSubmitRef.current || evaluating) return;
    expireSubmitRef.current = true;
    void submitMcqAttempt(answers);
  }, [now, attempt, task, answers, evaluating, submitMcqAttempt]);

  const abandonInProgressAttempt = useCallback(async (
    skillId: string,
    existing?: AttemptRecord | null,
  ) => {
    const current = existing ?? attemptsMap[skillId] ?? null;
    if (userId) {
      localStorage.removeItem(practicalTaskStorageKey(userId, skillId));
    }

    if (current?.status === "in_progress") {
      const abandoned: AttemptRecord = {
        ...current,
        status: "expired_no_submission",
        endsAt: new Date().toISOString(),
      };
      await saveAttempt(abandoned);

      const completed = mcqResultsMap[skillId];
      if (completed && isMcqRowCompleted(completed)) {
        setAttemptsMap((map) => ({
          ...map,
          [skillId]: mcqResultToAttemptRecord(skillId, completed, abandoned),
        }));
      } else {
        setMcqResultsMap((map) => {
          const next = { ...map };
          const row = next[skillId];
          if (row && !isMcqRowCompleted(row)) delete next[skillId];
          return next;
        });
      }
      return;
    }

    setMcqResultsMap((map) => {
      const next = { ...map };
      const row = next[skillId];
      if (row && !isMcqRowCompleted(row)) delete next[skillId];
      return next;
    });
  }, [attemptsMap, mcqResultsMap, saveAttempt, userId]);

  const quitMcqAttempt = useCallback(async () => {
    if (!activeSkill) return;
    const skillId = activeSkill.id;
    await abandonInProgressAttempt(skillId, attempt);
    resetPracticalTaskState(skillId);
    setActiveSkill(null);
    setPanelMode("start");
    setShowResultModal(false);
    toast({
      title: "Sitting quit",
      description: "This attempt was discarded. Start again whenever you are ready.",
    });
    refresh();
  }, [abandonInProgressAttempt, activeSkill, attempt, resetPracticalTaskState]);

  const openSkill = useCallback(async (
    skill: DeclaredSkill,
    intent: "start" | "resume" | "view" = "start",
  ) => {
    if (!userId) return;

    setActiveSkill(skill);
    setGenerateError(null);
    setShowResultModal(false);
    setTaskLoading(true);

    try {
      const mcqResult = mcqResultsMap[skill.id]
        ?? await fetchLatestCompletedMcqAttemptResult(userId, skill.id);
      const existing = attemptsMap[skill.id] ?? null;
      const taskState = derivePracticalTaskState(existing, mcqResult ?? null);

      await loadAttemptHistory(skill.id);

      if (taskState === "COMPLETED" && intent !== "start") {
        localStorage.removeItem(practicalTaskStorageKey(userId, skill.id));

        const display = getSkillMcqDisplay(skill.id, attemptsMap, {
          ...mcqResultsMap,
          ...(mcqResult ? { [skill.id]: mcqResult } : {}),
        });

        setTask(null);
        setAnswers({});
        setCurrentQuestionIndex(0);
        setQuestionEndsAt(null);
        setResultPercentage(display.percentage);
        setResultCorrectCount(mcqResult?.correct_count ?? null);
        setResultTotalQuestions(mcqResult?.total_questions ?? null);
        setResultLabel(display.label);
        setPassed(display.passed);
        setAttempt(existing ?? (mcqResult ? mcqResultToAttemptRecord(skill.id, mcqResult) : null));
        setPanelMode("result");
        return;
      }

      if (intent === "start" || taskState === "NOT_STARTED" || taskState === "IN_PROGRESS") {
        if (taskState === "IN_PROGRESS" || existing?.status === "in_progress") {
          await abandonInProgressAttempt(skill.id, existing);
        }
        resetPracticalTaskState(skill.id);
        setPanelMode("start");
        return;
      }

      resetPracticalTaskState(skill.id);
      setPanelMode("start");
    } finally {
      setTaskLoading(false);
    }
  }, [
    userId,
    mcqResultsMap,
    attemptsMap,
    abandonInProgressAttempt,
    loadAttemptHistory,
    resetPracticalTaskState,
  ]);

  const startMcqAttempt = async () => {
    if (!activeSkill) return;

    resetPracticalTaskState(activeSkill.id);
    setGeneratingMcqs(true);
    setPanelMode("mcq");

    try {
      const generatedTask = await generateSecureMcqTask(activeSkill, repos, invokeRapidTask);
      setTask(generatedTask);

      const start = new Date();
      const end = new Date(start.getTime() + MCQ_SITTING_SECONDS * 1000);
      const sittingSeconds = MCQ_SITTING_SECONDS;
      const progress = {
        ...createInitialMcqProgress(sittingSeconds),
        questionEndsAt: end.toISOString(),
      };
      const { attemptId, ...taskBody } = generatedTask;

      const rec: AttemptRecord = {
        skillId: activeSkill.id,
        attemptId: genAttemptId(),
        startedAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMinutes: generatedTask.durationMinutes,
        status: "in_progress",
        submission: serializeMcqSession({
          _mcqSession: true,
          attemptId,
          task: taskBody,
          progress,
        }),
        credentialSyncSnapshot: activeSkill.lastCredentialSyncAt ?? null,
      };

      await saveAttempt(rec);
      setAttempt(rec);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setQuestionEndsAt(progress.questionEndsAt);
      setNow(Date.now());
      toast({
        title: "MCQ ready",
        description: `${generatedTask.questions.length} closed-ended questions · ${MCQ_SITTING_SECONDS} second sitting.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGenerateError(message);
      setPanelMode("start");
      toast({ title: "Could not generate MCQ", description: message, variant: "destructive" });
    } finally {
      setGeneratingMcqs(false);
    }
  };

  const setResponse = (questionId: string, value: AssessmentAnswerValue | null) => {
    if (!attempt || attempt.status !== "in_progress" || !questionEndsAt || !task) return;
    const nextAnswers = { ...answers };
    if (!isResponsePresent(value)) delete nextAnswers[questionId];
    else nextAnswers[questionId] = value as AssessmentAnswerValue;
    void persistProgress(attempt, task, nextAnswers, currentQuestionIndex, attempt.endsAt);
  };

  const selectAnswer = (questionId: string, optionId: McqOptionId) => {
    if (!attempt || attempt.status !== "in_progress" || !questionEndsAt || !task) return;
    const nextAnswers = { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);
    void persistProgress(attempt, task, nextAnswers, currentQuestionIndex, attempt.endsAt);
  };

  const goToQuestion = (index: number) => {
    if (!task || !attempt || attempt.status !== "in_progress") return;
    if (index < 0 || index >= task.questions.length) return;
    if (index === currentQuestionIndex && quizView === "question") return;
    setMaxVisitedIndex((visited) => Math.max(visited, index));
    const nextEndsAt = attempt.endsAt;
    setQuizView("question");
    void persistProgress(attempt, task, answers, index, nextEndsAt);
    setNow(Date.now());
  };

  const goToPreviousQuestion = () => {
    if (isFirstQuestion) return;
    goToQuestion(currentQuestionIndex - 1);
  };

  const toggleFlag = (questionId: string) => {
    setFlaggedIds((current) => (
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    ));
  };

  const openReview = () => {
    if (!task || !attempt || attempt.status !== "in_progress") return;
    setQuizView("review");
  };

  const goToNextQuestion = () => {
    if (isLastQuestion) {
      openReview();
      return;
    }
    if (!currentAnswerSelected) {
      toast({
        title: "Select an answer",
        description: "Choose an option, or wait for the timer to move on.",
        variant: "destructive",
      });
      return;
    }
    void advanceQuestion(false);
  };

  useEffect(() => {
    if (task) return;
    if (!activeSkill || panelMode !== "mcq" || quizView !== "question") return;
    if (!attempt || attempt.status !== "in_progress" || !currentQuestion || !task) return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (target?.closest("button, a") && (event.key === "Enter" || event.key === " ")) return;

      const key = event.key.toLowerCase();
      const optionByKey: Record<string, McqOptionId> = {
        a: "A",
        b: "B",
        c: "C",
        d: "D",
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "D",
      };
      const optionId = optionByKey[key];
      if (optionId && currentQuestion.options.some((option) => option.id === optionId)) {
        event.preventDefault();
        selectAnswer(currentQuestion.id, optionId);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousQuestion();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        goToNextQuestion();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        toggleFlag(currentQuestion.id);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeSkill,
    panelMode,
    quizView,
    attempt,
    currentQuestion,
    task,
    selectAnswer,
    goToPreviousQuestion,
    goToNextQuestion,
  ]);

  const closePanel = () => {
    setActiveSkill(null);
    setPanelMode("start");
    setShowResultModal(false);
    setAttemptHistory([]);
    refresh();
  };

  const getTaskState = useCallback((skillId: string): PracticalTaskState => {
    return derivePracticalTaskState(
      attemptsMap[skillId] ?? null,
      mcqResultsMap[skillId] ?? null,
    );
  }, [attemptsMap, mcqResultsMap]);

  const timelineEntries = useMemo((): AttemptHistoryEntry[] => {
    const entries: AttemptHistoryEntry[] = [];
    for (const s of skills) {
      for (const item of gradedAttempts(historyMap[s.id] ?? [])) {
        entries.push({
          id: item.id,
          skillName: s.name,
          attemptNumber: item.attemptNumber,
          percentage: item.percentage,
          passed: item.passed,
          at: item.at,
        });
      }
    }
    return entries
      .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime())
      .slice(0, 8);
  }, [skills, historyMap]);

  const skillMatchesQuery = useCallback((skill: DeclaredSkill) => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) return true;
    return [skill.name, skill.domain, skill.description, skill.status]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  }, [skillQuery]);

  const filterCounts = useMemo(() => {
    const counts: Record<TaskFilter, number> = { all: 0, in_progress: 0, completed: 0, locked: 0 };
    for (const skill of skills) {
      if (!skillMatchesQuery(skill)) continue;
      const attemptRecord = getAttempt(skill.id);
      const state = getTaskState(skill.id);
      const locked = isAttemptLocked(skill, attemptRecord);
      counts.all += 1;
      if (state === "IN_PROGRESS") counts.in_progress += 1;
      if (state === "COMPLETED") counts.completed += 1;
      if (locked && state !== "COMPLETED") counts.locked += 1;
    }
    return counts;
  }, [skills, getAttempt, getTaskState, skillMatchesQuery]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      if (!skillMatchesQuery(s)) return false;
      const a = getAttempt(s.id);
      const state = getTaskState(s.id);
      const locked = isAttemptLocked(s, a);
      if (taskFilter === "all") return true;
      if (taskFilter === "in_progress") return state === "IN_PROGRESS";
      if (taskFilter === "completed") return state === "COMPLETED";
      if (taskFilter === "locked") return locked && state !== "COMPLETED";
      return true;
    });
  }, [skills, taskFilter, getAttempt, getTaskState, skillMatchesQuery]);

  const hasNextTask = useMemo(
    () => skills.some((s) => {
      const a = getAttempt(s.id);
      const state = getTaskState(s.id);
      return state === "IN_PROGRESS" || (state !== "COMPLETED" && !isAttemptLocked(s, a));
    }),
    [skills, getAttempt, getTaskState],
  );

  const startNextTask = () => {
    const next = skills.find((s) => {
      const a = getAttempt(s.id);
      const state = getTaskState(s.id);
      return state !== "COMPLETED" && !isAttemptLocked(s, a);
    });
    if (next) void openSkill(next, "start");
  };

  if (skillsLoading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={3} />
      </LearnerWorkspaceShell>
    );
  }

  const examActive = panelMode === "mcq"
    && !!task
    && !!attempt
    && attempt.status === "in_progress"
    && !generatingMcqs;

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <PracticalTasksHero
            hasNextTask={hasNextTask}
            onStartNext={startNextTask}
          />

          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-[#0f172a]">Practical Tasks</h2>
              <TaskFilterTabs value={taskFilter} onChange={setTaskFilter} counts={filterCounts} />
            </div>
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
                placeholder="Search by competency, domain, or title..."
                className="h-10 rounded-xl bg-[#f8fafc] pl-9"
                aria-label="Search practical tasks"
              />
            </div>
          </div>

          {skills.length === 0 ? (
            <EmptyTasksPanel onGoProfile={() => navigate("/learner/profile")} />
          ) : filteredSkills.length === 0 ? (
            <div className="learner-stat-card px-6 py-10 text-center">
              <p className="font-semibold text-[#0f172a]">No tasks match this view</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Try another filter or clear the search.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setSkillQuery("");
                  setTaskFilter("all");
                }}
              >
                Show all tasks
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSkills.map((s, index) => {
                const a = getAttempt(s.id);
                const taskState = getTaskState(s.id);
                const locked = isAttemptLocked(s, a);
                const display = getSkillMcqDisplay(s.id, attemptsMap, mcqResultsMap);
                return (
                  <PracticalTaskCard
                    key={s.id}
                    skill={s}
                    index={index}
                    taskState={taskState}
                    display={display}
                    history={historyMap[s.id] ?? []}
                    locked={locked}
                    lastDays={daysSince(s.lastRelatedActivityAt)}
                    onStart={() => void openSkill(s, "start")}
                    onResume={() => void openSkill(s, "start")}
                    onView={() => void openSkill(s, "view")}
                    onRetake={() => void openSkill(s, "start")}
                  />
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div id="pt-attempt-timeline">
            <AttemptTimelinePanel entries={timelineEntries} />
          </div>
        </aside>
      </div>

      <PracticalTasksFooter />

      {examActive && activeSkill && task && attempt ? (
        <AssessmentWorkspace
          skillName={activeSkill.name}
          title={task.title}
          questions={task.questions}
          answers={answers}
          currentIndex={currentQuestionIndex}
          flaggedIds={flaggedIds}
          deadlineAt={attempt.endsAt}
          now={now}
          evaluating={evaluating}
          onAnswer={setResponse}
          onJump={goToQuestion}
          onFlag={toggleFlag}
          onSubmit={() => void submitMcqAttempt(answers)}
          onQuit={() => void quitMcqAttempt()}
        />
      ) : null}

      <Dialog open={!!activeSkill && !examActive} onOpenChange={(o) => { if (!o) closePanel(); }}>
        <DialogContent
          className={cn(
            "max-h-[90vh] flex flex-col overflow-hidden",
            panelMode === "mcq" && task && attempt && !taskLoading
              ? cn("pt-mcq-dialog", currentQuestion?.kind === "code" && quizView === "question" ? "pt-mcq-dialog--code max-w-4xl" : "max-w-2xl")
              : "max-w-3xl gap-4",
          )}
          {...NO_COPY_PROPS}
        >
          {activeSkill && (
            taskLoading ? (
              <CardSkeleton />
            ) : panelMode === "result" ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff6ff] text-sm font-bold text-[#023E8A]">
                      {activeSkill.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <DialogTitle>{activeSkill.name} • Attempt Result</DialogTitle>
                      <DialogDescription className="sr-only">
                        Latest score and attempt history for this practical task.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto">
                  <McqScoreSummary
                    percentage={resultPercentage ?? attempt?.score ?? null}
                    correctCount={resultCorrectCount}
                    totalQuestions={resultTotalQuestions}
                    label={resultLabel}
                    passed={passed}
                    submittedAt={mcqResultsMap[activeSkill.id]?.submitted_at ?? attempt?.endsAt}
                    variant="result"
                  />
                  <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                      <ListOrdered className="h-4 w-4 text-[#023E8A]" aria-hidden />
                      Attempt History
                    </p>
                    <AttemptMarksTimeline rows={historyMap[activeSkill.id] ?? attemptHistory} compact />
                  </div>
                </div>
                <DialogFooter className="shrink-0 gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={closePanel}>Close</Button>
                  <Button
                    className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                    onClick={() => {
                      setGenerateError(null);
                      setShowResultModal(false);
                      setPanelMode("start");
                    }}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Retake Task
                  </Button>
                </DialogFooter>
              </>
            ) : panelMode === "start" ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff6ff] text-sm font-bold text-[#023E8A]">
                      {activeSkill.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <DialogTitle>
                        {activeSkill.name.toLowerCase().includes("practical")
                          ? activeSkill.name
                          : `${activeSkill.name} Practical Task`}
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        Start or retake this practical task.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto">
                  {gradedAttempts(historyMap[activeSkill.id] ?? attemptHistory).length > 0 ? (
                    <>
                      <McqScoreSummary
                        percentage={
                          gradedAttempts(historyMap[activeSkill.id] ?? attemptHistory).at(-1)?.percentage ?? null
                        }
                        correctCount={
                          (historyMap[activeSkill.id] ?? attemptHistory).filter(isMcqRowCompleted).at(-1)?.correct_count ?? null
                        }
                        totalQuestions={
                          (historyMap[activeSkill.id] ?? attemptHistory).filter(isMcqRowCompleted).at(-1)?.total_questions ?? null
                        }
                        label={null}
                        passed={true}
                        submittedAt={
                          gradedAttempts(historyMap[activeSkill.id] ?? attemptHistory).at(-1)?.at ?? null
                        }
                        variant="previous"
                      />
                      <RetakeIntroBanner />
                      <TaskDetailsGrid />
                    </>
                  ) : (
                    <TaskDetailsGrid />
                  )}
                  {generateError && <p className="text-xs text-destructive">{generateError}</p>}
                </div>
                <DialogFooter className="shrink-0 gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={closePanel}>
                    Cancel
                  </Button>
                  <Button
                    className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                    onClick={() => void startMcqAttempt()}
                    disabled={generatingMcqs}
                  >
                    {generatingMcqs ? (
                      <>
                        <RefreshCcw className="h-4 w-4 mr-1.5 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1.5" />
                        {gradedAttempts(historyMap[activeSkill.id] ?? attemptHistory).length > 0
                          ? "Retake Task"
                          : "Start Task"}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            ) : generatingMcqs && !task ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <RefreshCcw className="h-6 w-6 animate-spin text-[#64748b]" />
                <span className="text-sm text-[#64748b]">Generating MCQ task…</span>
              </div>
            ) : task && attempt ? (
              <>
                <div className={cn("pt-mcq-header shrink-0", currentQuestion?.kind === "code" && quizView === "question" && "pt-mcq-header--code")}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-white">
                        {quizView === "review"
                          ? "Review"
                          : currentQuestion?.kind === "code"
                            ? "Code lab"
                            : "Concept round"} · {activeSkill.name}
                      </h2>
                      <p className="mt-1 text-xs text-white/70">
                        {answeredCount}/{task.questions.length} answered
                        {flaggedIds.length > 0 ? ` · ${flaggedIds.length} flagged` : ""}
                        {quizView === "question" && currentQuestion
                          ? ` · ${secondsForQuestion(currentQuestion)}s on this question`
                          : ""}
                        {quizView === "review" ? " · review pauses the timer" : ""}
                      </p>
                    </div>
                    {attempt.status === "in_progress" && quizView === "question" && (
                      <div className="flex items-center gap-2 shrink-0 text-white">
                        <TimerProgressRing
                          remainingMs={questionRemainingMs}
                          totalMs={secondsForQuestion(currentQuestion) * 1000}
                        />
                        <span className={`mono text-sm font-semibold ${questionRemainingMs <= 10000 ? "text-red-300" : ""}`}>
                          {fmt(questionRemainingMs)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-mcq-body flex-1 min-h-0 overflow-y-auto" {...NO_COPY_PROPS}>
                  {quizView === "review" && attempt.status === "in_progress" ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0f172a]">Review before you submit</p>
                        <p className="mt-1 text-xs text-[#64748b]">
                          Open any reached question to change the answer. Blank items count as incorrect.
                        </p>
                      </div>
                      <McqReviewList
                        questions={task.questions}
                        answers={answers}
                        flaggedIds={flaggedSet}
                        onJump={goToQuestion}
                      />
                    </div>
                  ) : isSubmitted ? (
                    <div className="space-y-3 text-sm">
                      <p className="font-medium text-[#023E8A]">Attempt timeline</p>
                      <AttemptMarksTimeline rows={historyMap[activeSkill.id] ?? attemptHistory} />
                    </div>
                  ) : currentQuestion ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold text-[#023E8A]">
                            Question {currentQuestionIndex + 1} of {task.questions.length}
                          </span>
                          <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[10px] font-medium capitalize text-[#64748b]">
                            {currentQuestion.difficulty}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-[11px]"
                          onClick={() => toggleFlag(currentQuestion.id)}
                        >
                          <Flag className={cn("mr-1 h-3 w-3", flaggedSet.has(currentQuestion.id) && "fill-[#CA8A04] text-[#CA8A04]")} />
                          {flaggedSet.has(currentQuestion.id) ? "Flagged" : "Flag"}
                        </Button>
                      </div>
                      <McqQuestionPalette
                        questionIds={task.questions.map((question) => question.id)}
                        currentIndex={currentQuestionIndex}
                        answeredIds={answeredSet}
                        flaggedIds={flaggedSet}
                        maxVisitedIndex={maxVisitedIndex}
                        kinds={task.questions.map((question) => question.kind)}
                        onJump={goToQuestion}
                      />
                      {currentQuestion.kind === "code" && currentQuestion.code ? (
                        <McqCodeStage code={currentQuestion.code} language={currentQuestion.language} />
                      ) : null}
                      <p className="text-sm font-semibold leading-relaxed text-[#0f172a]">
                        {currentQuestion.question}
                      </p>
                      <div className="space-y-2">
                        {currentQuestion.options.map((option) => (
                          <McqOptionButton
                            key={option.id}
                            optionId={option.id}
                            text={option.text}
                            selected={answers[currentQuestion.id] === option.id}
                            onSelect={() => selectAnswer(currentQuestion.id, option.id as McqOptionId)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="pt-mcq-footer shrink-0">
                  {attempt.status === "in_progress" && quizView === "review" ? (
                    <>
                      <p className="max-w-xs text-[11px] text-[#94a3b8]">
                        Timer is paused. Submit when the map looks right.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => goToQuestion(currentQuestionIndex)}
                          disabled={evaluating}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Back to question
                        </Button>
                        <Button
                          className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                          onClick={() => void submitMcqAttempt(answers)}
                          disabled={evaluating}
                        >
                          {evaluating ? "Submitting…" : "Submit MCQ"}
                          <Send className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </>
                  ) : attempt.status === "in_progress" && currentQuestion ? (
                    <>
                      <p className="max-w-xs text-[11px] text-[#94a3b8]">
                        A–D to answer · arrows to move · F to flag. Time up moves you on.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={goToPreviousQuestion}
                          disabled={isFirstQuestion || evaluating}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        {isLastQuestion ? (
                          <Button
                            className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                            onClick={openReview}
                            disabled={evaluating}
                          >
                            Review answers
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        ) : (
                          <Button
                            className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                            onClick={goToNextQuestion}
                            disabled={evaluating || !currentAnswerSelected}
                          >
                            Next question
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Button variant="outline" className="rounded-xl ml-auto" onClick={closePanel}>
                      Close
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <p className="text-sm text-center px-4 text-[#64748b]">Attempt data could not be loaded.</p>
                <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => void openSkill(activeSkill)}>
                  <RefreshCcw className="h-4 w-4 mr-1.5" />
                  Reload
                </Button>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>MCQ Result</DialogTitle>
            <DialogDescription>
              Your latest submission has been recorded.
            </DialogDescription>
          </DialogHeader>
          <McqScoreSummary
            percentage={resultPercentage}
            correctCount={resultCorrectCount}
            totalQuestions={resultTotalQuestions}
            label={resultLabel}
            passed={passed}
            message={resultMessage}
          />
          {activeSkill ? (
            <AttemptMarksTimeline rows={historyMap[activeSkill.id] ?? attemptHistory} />
          ) : null}
          <DialogFooter>
            <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => setShowResultModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LearnerWorkspaceShell>
  );
}

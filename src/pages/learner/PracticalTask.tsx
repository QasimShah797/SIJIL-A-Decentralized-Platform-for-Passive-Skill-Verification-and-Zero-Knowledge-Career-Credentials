import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Play, Timer, Lock, Send, RefreshCcw, ChevronRight, ChevronLeft,
} from "lucide-react";
import { daysSince, type DeclaredSkill, type AttemptRecord } from "@/lib/sijil-data";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useAuth } from "@/hooks/useAuth";
import { useGitHub } from "@/hooks/useGitHub";
import {
  loadAttemptsWithMcqResults,
  saveAttemptDb,
  fetchLatestMcqAttemptResult,
  fetchLatestCompletedMcqAttemptResult,
  fetchMcqAttemptHistory,
  derivePracticalTaskState,
  mcqResultToAttemptRecord,
  isMcqRowCompleted,
  isAttemptLocked,
  type McqAttemptResultRow,
  type PracticalTaskState,
} from "@/lib/db/practical-attempts";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createInitialMcqProgress,
  evaluateSecureMcqAttempt,
  generateSecureMcqTask,
  buildMcqSubmissionAnswers,
  MCQ_SECONDS_PER_QUESTION,
  isMcqPassed,
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

async function invokeRapidTask(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("rapid-task", { body });
  return {
    data: (data as Record<string, unknown> | null) ?? null,
    error: error ?? null,
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
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
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

function formatAttemptHistoryLabel(row: McqAttemptResultRow): string {
  const percentage = typeof row.percentage === "number" ? row.percentage : null;
  const passed = typeof row.passed === "boolean" ? row.passed : isMcqPassed(percentage);
  const label = mcqResultLabel(percentage, passed);
  if (percentage != null && label) return `${percentage}% · ${label}`;
  if (percentage != null) return `${percentage}%`;
  return label ?? "Submitted";
}

export default function PracticalTask() {
  const { user } = useAuth();
  const userId = user?.id;
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const { repos } = useGitHub();
  const [attemptsMap, setAttemptsMap] = useState<Record<string, AttemptRecord>>({});
  const [mcqResultsMap, setMcqResultsMap] = useState<Record<string, McqAttemptResultRow>>({});
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
    loadAttemptsWithMcqResults(userId, skills.map((s) => s.id)).then(({ attempts, mcqResults }) => {
      setAttemptsMap(attempts);
      setMcqResultsMap(mcqResults);
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
    setAttemptHistory([]);
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
  ]);

  const loadAttemptHistory = useCallback(async (skillId: string) => {
    if (!userId) {
      setAttemptHistory([]);
      return;
    }
    const history = await fetchMcqAttemptHistory(userId, skillId);
    setAttemptHistory(history);
  }, [userId]);

  const currentQuestion = task?.questions[currentQuestionIndex] ?? null;
  const isLastQuestion = task ? currentQuestionIndex >= task.questions.length - 1 : false;
  const isFirstQuestion = currentQuestionIndex === 0;
  const currentAnswerSelected = currentQuestion ? answers[currentQuestion.id] != null : false;

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
      const nextPassed = isMcqPassed(result.percentage);
      const nextResultLabel = mcqResultLabel(result.percentage, nextPassed) ?? result.resultLabel;
      const walletMessage = nextPassed
        ? "Wallet record updated. This competency now includes the submitted task result in its evidence package."
        : "Wallet record updated. This attempt remains part of the competency evidence history.";
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
      if (isLastQuestion) {
        await submitMcqAttempt(answers);
        return;
      }

      const nextIndex = currentQuestionIndex + 1;
      const nextEndsAt = new Date(Date.now() + MCQ_SECONDS_PER_QUESTION * 1000).toISOString();
      await persistProgress(attempt, task, answers, nextIndex, nextEndsAt);
      setNow(Date.now());

      if (timedOut) {
        toast({
          title: "Time up",
          description: `Question ${currentQuestionIndex + 1} closed. Showing question ${nextIndex + 1}.`,
        });
      }
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
    if (!attempt || attempt.status !== "in_progress" || !task || !questionEndsAt) return;
    if (questionRemainingMs > 0) return;
    void advanceQuestion(true);
  }, [questionRemainingMs, attempt?.status, task, questionEndsAt, advanceQuestion]);

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

      if (intent === "start" || taskState === "NOT_STARTED") {
        resetPracticalTaskState(skill.id);
        setPanelMode("start");
        return;
      }

      setPanelMode("mcq");
      const restoredFromStorage = hydratePracticalTaskState(skill.id, true);
      if (restoredFromStorage) {
        if (existing) {
          void syncAttemptResultFromServer(skill.id, existing);
        }
        return;
      }

      if (existing) {
        applyStoredState(restoreFromAttemptRecord(existing));
        void syncAttemptResultFromServer(skill.id, existing);
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
    applyStoredState,
    hydratePracticalTaskState,
    loadAttemptHistory,
    resetPracticalTaskState,
    syncAttemptResultFromServer,
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
      const totalMs = generatedTask.questions.length * MCQ_SECONDS_PER_QUESTION * 1000;
      const end = new Date(start.getTime() + totalMs);
      const progress = createInitialMcqProgress();
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
        description: `${generatedTask.questions.length} AI-generated questions · ${MCQ_SECONDS_PER_QUESTION}s each.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGenerateError(message);
      toast({ title: "Could not generate MCQ", description: message, variant: "destructive" });
    } finally {
      setGeneratingMcqs(false);
    }
  };

  const selectAnswer = (questionId: string, optionId: McqOptionId) => {
    if (!attempt || attempt.status !== "in_progress" || !questionEndsAt || !task) return;
    const nextAnswers = { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);
    void persistProgress(attempt, task, nextAnswers, currentQuestionIndex, questionEndsAt);
  };

  const goToPreviousQuestion = () => {
    if (!task || !attempt || isFirstQuestion) return;
    const nextIndex = currentQuestionIndex - 1;
    const nextEndsAt = new Date(Date.now() + MCQ_SECONDS_PER_QUESTION * 1000).toISOString();
    void persistProgress(attempt, task, answers, nextIndex, nextEndsAt);
    setNow(Date.now());
  };

  const goToNextQuestion = () => {
    if (!currentAnswerSelected) {
      toast({
        title: "Select an answer",
        description: "Choose an option before continuing.",
        variant: "destructive",
      });
      return;
    }
    void advanceQuestion(false);
  };

  const closePanel = () => {
    setActiveSkill(null);
    setPanelMode("start");
    setShowResultModal(false);
    refresh();
  };

  const getTaskState = useCallback((skillId: string): PracticalTaskState => {
    return derivePracticalTaskState(
      attemptsMap[skillId] ?? null,
      mcqResultsMap[skillId] ?? null,
    );
  }, [attemptsMap, mcqResultsMap]);

  const statusBadge = (skill: DeclaredSkill) => {
    const a = getAttempt(skill.id);
    const taskState = getTaskState(skill.id);
    const display = getSkillMcqDisplay(skill.id, attemptsMap, mcqResultsMap);
    const locked = isAttemptLocked(skill, a);

    if (taskState === "COMPLETED") {
      return (
        <StatusBadge variant={display.passed ? "verified" : "warning"}>
          {display.percentage != null ? `${display.percentage}% · ${display.label}` : display.label ?? "Completed"}
        </StatusBadge>
      );
    }
    if (taskState === "IN_PROGRESS") return <StatusBadge variant="info">In Progress</StatusBadge>;
    if (!a) return <StatusBadge variant="neutral">No Attempt</StatusBadge>;
    if (a.status === "expired_no_submission") return <StatusBadge variant="warning">No Submission</StatusBadge>;
    return locked ? <StatusBadge variant="neutral">Locked</StatusBadge> : <StatusBadge variant="neutral">Available</StatusBadge>;
  };

  if (skillsLoading) {
    return <AppShell role="learner"><div className="text-sm text-muted-foreground">Loading skills…</div></AppShell>;
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Practical Tasks"
        description="AI-generated MCQ tests based on your declared competency and linked evidence. Answers are evaluated securely on the server."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill-bound practical checks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {skills.map((s) => {
              const a = getAttempt(s.id);
              const locked = isAttemptLocked(s, a);
              const lastDays = daysSince(s.lastRelatedActivityAt);
              const taskState = getTaskState(s.id);
              const display = getSkillMcqDisplay(s.id, attemptsMap, mcqResultsMap);
              return (
                <div key={s.id} className="flex flex-col md:flex-row md:items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">· {s.domain}</span>
                      {statusBadge(s)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">MCQ practical task · {s.domain}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
                      {locked && <> · Locked until next credential sync</>}
                    </div>
                    {taskState === "COMPLETED" && (
                      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm space-y-2 max-w-lg">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium">Score: {display.percentage ?? "—"}%</span>
                          {display.label && (
                            <StatusBadge variant={display.passed ? "verified" : "warning"}>
                              {display.label}
                            </StatusBadge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatAttemptDate(display.submittedAt)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openSkill(s, "view")}
                        >
                          <Lock className="h-4 w-4 mr-1.5" />View Attempt
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {taskState === "COMPLETED" ? null : taskState === "IN_PROGRESS" ? (
                      <Button onClick={() => void openSkill(s, "resume")}>
                        <Timer className="h-4 w-4 mr-1.5" />Resume MCQ
                      </Button>
                    ) : (
                      <Button onClick={() => void openSkill(s, "start")} disabled={locked && !a}>
                        <Play className="h-4 w-4 mr-1.5" />Start task
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
        <RefreshCcw className="h-3.5 w-3.5" />
        MCQ content cannot be copied. Percentage results are shown after submission; answer keys are never shown to learners.
      </p>

      <Dialog open={!!activeSkill} onOpenChange={(o) => { if (!o) closePanel(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden gap-4" {...NO_COPY_PROPS}>
          {activeSkill && (
            taskLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading attempt…</span>
              </div>
            ) : panelMode === "result" ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <DialogTitle>{activeSkill.name} · Attempt Result</DialogTitle>
                  <DialogDescription>
                    Latest completed MCQ practical task for this competency.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-3">
                    <p className="font-medium">
                      Score: {resultPercentage ?? attempt?.score ?? "—"}%
                      {resultLabel && (
                        <span className={passed ? " text-success" : " text-destructive"}>
                          {" "}· {resultLabel}
                        </span>
                      )}
                    </p>
                    {resultCorrectCount != null && resultTotalQuestions != null && (
                      <p className="text-muted-foreground">
                        Correct answers: {resultCorrectCount} / {resultTotalQuestions}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      Submitted: {formatAttemptDate(
                        mcqResultsMap[activeSkill.id]?.submitted_at ?? attempt?.endsAt,
                      )}
                    </p>
                    {attemptHistory.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground">Attempt history</p>
                        <ul className="space-y-2">
                          {attemptHistory.map((row) => (
                            <li
                              key={row.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                            >
                              <span>{row.title ?? `${activeSkill.name} MCQ`}</span>
                              <span className="text-muted-foreground">
                                {formatAttemptHistoryLabel(row)}
                                {row.submitted_at ? ` · ${formatAttemptDate(row.submitted_at)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter className="shrink-0">
                  <Button variant="outline" onClick={closePanel}>Close</Button>
                </DialogFooter>
              </>
            ) : panelMode === "start" ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <DialogTitle>{activeSkill.name} Practical Task</DialogTitle>
                  <DialogDescription>
                    MCQ tests are generated from your competency and linked GitHub/Moodle evidence.
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border-2 border-dashed border-border p-6 text-center bg-muted/30">
                  <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm font-medium">Generate AI MCQ Task</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    10 questions · 4 easy, 4 medium, 2 hard · {MCQ_SECONDS_PER_QUESTION}s per question
                  </div>
                  {generateError && <p className="text-xs text-destructive mt-3">{generateError}</p>}
                  <Button
                    className="mt-4"
                    onClick={() => void startMcqAttempt()}
                    disabled={generatingMcqs}
                  >
                    {generatingMcqs ? (
                      <>
                        <RefreshCcw className="h-4 w-4 mr-1.5 animate-spin" />
                        Generating MCQ Task…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1.5" />
                        {generateError ? "Retry Generate MCQ Task" : "Generate MCQ Task"}
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : generatingMcqs && !task ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Generating MCQ task…</span>
              </div>
            ) : task && attempt ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <DialogTitle className="flex items-center gap-2">
                    {task.title}
                    <span className="text-xs text-muted-foreground font-normal">· {activeSkill.name}</span>
                  </DialogTitle>
                  <DialogDescription>
                    {task.questions.length} MCQs · {MCQ_SECONDS_PER_QUESTION}s per question · one at a time
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2" {...NO_COPY_PROPS}>
                  {isSubmitted ? (
                    <div className="space-y-4">
                      <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-3">
                        <p className="font-medium">Attempt history</p>
                        {attemptHistory.length > 0 ? (
                          <ul className="space-y-2">
                            {attemptHistory.map((row) => (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                              >
                                <span>{row.title ?? `${activeSkill.name} MCQ`}</span>
                                <span className="text-muted-foreground">
                                  {formatAttemptHistoryLabel(row)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">
                            Submitted · Result: {resultPercentage ?? attempt.score ?? "—"}%
                            {resultLabel && (
                              <span className={passed ? " text-success" : " text-destructive"}>
                                {" "}· {resultLabel}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          Previous attempts stay in your evidence history. Result details appear only right after a new submission.
                        </p>
                      </div>
                    </div>
                  ) : currentQuestion ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">Question</span>
                          <span className="font-medium">{currentQuestionIndex + 1} / {task.questions.length}</span>
                          <span className="text-xs capitalize text-muted-foreground">{currentQuestion.difficulty}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={`mono ${questionRemainingMs <= 10000 ? "text-destructive font-semibold" : ""}`}>
                            {fmt(questionRemainingMs)}
                          </span>
                          <StatusBadge variant="info">In Progress</StatusBadge>
                        </div>
                      </div>

                      <div className="rounded-md border p-5 space-y-4" {...NO_COPY_PROPS}>
                        <div className="text-sm font-medium leading-relaxed">{currentQuestion.question}</div>
                        <RadioGroup
                          value={answers[currentQuestion.id] ?? ""}
                          onValueChange={(value) => selectAnswer(currentQuestion.id, value as McqOptionId)}
                        >
                          {currentQuestion.options.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2">
                              <RadioGroupItem value={option.id} id={`${currentQuestion.id}-${option.id}`} />
                              <Label htmlFor={`${currentQuestion.id}-${option.id}`} className="text-sm font-normal cursor-pointer">
                                <span className="font-medium mr-2">{option.id}.</span>
                                {option.text}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="shrink-0 flex-wrap gap-2">
                  {attempt.status === "in_progress" && currentQuestion ? (
                    <>
                      <Button variant="outline" onClick={goToPreviousQuestion} disabled={isFirstQuestion || evaluating}>
                        <ChevronLeft className="h-4 w-4 mr-1" />Previous
                      </Button>
                      {isLastQuestion ? (
                        <Button onClick={goToNextQuestion} disabled={evaluating || !currentAnswerSelected}>
                          <Send className="h-4 w-4 mr-1.5" />
                          {evaluating ? "Submitting…" : "Submit MCQ"}
                        </Button>
                      ) : (
                        <Button onClick={goToNextQuestion} disabled={evaluating || !currentAnswerSelected}>
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="outline" onClick={closePanel}>Close</Button>
                  )}
                </DialogFooter>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <p className="text-sm text-center px-4 text-muted-foreground">Attempt data could not be loaded.</p>
                <Button onClick={() => void openSkill(activeSkill)}>
                  <RefreshCcw className="h-4 w-4 mr-1.5" />Reload
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
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              Result: {resultPercentage ?? "—"}%
              {resultLabel && (
                <span className={passed ? " text-success" : " text-destructive"}>
                  {" "}· {resultLabel}
                </span>
              )}
            </p>
            {resultCorrectCount != null && resultTotalQuestions != null && (
              <p className="text-muted-foreground">
                Correct answers: {resultCorrectCount} / {resultTotalQuestions}
              </p>
            )}
            {resultMessage && (
              <p className="text-muted-foreground text-xs">{resultMessage}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowResultModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

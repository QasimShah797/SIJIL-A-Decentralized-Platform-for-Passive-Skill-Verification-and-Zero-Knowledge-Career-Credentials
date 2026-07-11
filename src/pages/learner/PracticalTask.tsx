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
  Play, Timer, Lock, Send, AlertTriangle, RefreshCcw, ChevronRight, ChevronLeft,
} from "lucide-react";
import { isSkillDecaying, daysSince, type DeclaredSkill, type AttemptRecord } from "@/lib/sijil-data";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useAuth } from "@/hooks/useAuth";
import { useGitHub } from "@/hooks/useGitHub";
import {
  loadAttempts,
  saveAttemptDb,
  fetchLatestMcqAttemptResult,
  isAttemptLocked,
} from "@/lib/db/practical-attempts";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createInitialMcqProgress,
  evaluateSecureMcqAttempt,
  generateSecureMcqTask,
  buildMcqSubmissionAnswers,
  MCQ_PASS_PERCENT,
  MCQ_SECONDS_PER_QUESTION,
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

function practicalTaskModalKey(userId: string) {
  return `sijil-practical-task-modal-${userId}`;
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
  const submitted = existing.status === "submitted" || existing.status === "auto_submitted";

  return {
    task: restoredTask,
    attempt: existing,
    answers: progress?.answers ?? parseMcqAnswers(existing.submission ?? ""),
    currentQuestionIndex: progress?.currentIndex ?? 0,
    questionEndsAt: progress?.questionEndsAt ?? null,
    resultPercentage: session?.resultPercentage ?? existing.score ?? null,
    resultCorrectCount: session?.resultCorrectCount ?? null,
    resultTotalQuestions: session?.resultTotalQuestions ?? null,
    resultMessage: session?.resultMessage ?? existing.feedback ?? null,
    resultLabel: session?.resultLabel
      ?? (existing.passed ? "Passed" : existing.score != null ? "Needs Improvement" : null),
    passed: session?.passed ?? existing.passed ?? (existing.status === "passed" ? true : existing.score != null ? existing.score >= MCQ_PASS_PERCENT : null),
    submitted,
  };
}

export default function PracticalTask() {
  const { user } = useAuth();
  const userId = user?.id;
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const { repos } = useGitHub();
  const [attemptsMap, setAttemptsMap] = useState<Record<string, AttemptRecord>>({});
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const modalRestoredRef = useRef(false);
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
    loadAttempts(userId, skills.map((s) => s.id)).then((map) => {
      setAttemptsMap(map);
      attemptsLoadedRef.current = true;
    });
  }, [userId, skills]);

  const getAttempt = useCallback((skillId: string) => attemptsMap[skillId] ?? null, [attemptsMap]);
  const saveAttempt = useCallback(async (rec: AttemptRecord) => {
    if (!userId) return;
    await saveAttemptDb(userId, rec);
    setAttemptsMap((m) => ({ ...m, [rec.skillId]: rec }));
  }, [userId]);

  const [activeSkill, setActiveSkill] = useState<DeclaredSkill | null>(null);
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
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);
  const advancingRef = useRef(false);

  const storageKey = userId && activeSkill?.id
    ? practicalTaskStorageKey(userId, activeSkill.id)
    : null;

  const isSubmitted = attempt && (
    attempt.status === "submitted"
    || attempt.status === "auto_submitted"
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

  const hydratePracticalTaskState = useCallback((skillId: string): boolean => {
    if (!userId) return false;
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
    const nextPassed = typeof remote.passed === "boolean" ? remote.passed : existing.passed ?? null;
    const nextLabel = nextPassed === true
      ? "Passed"
      : nextPercentage != null
        ? "Needs Improvement"
        : null;

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
      : existing.status === "in_progress"
        ? existing.status
        : "submitted";

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

  useEffect(() => {
    if (!userId) return;
    if (activeSkill?.id) {
      localStorage.setItem(practicalTaskModalKey(userId), activeSkill.id);
    }
  }, [userId, activeSkill?.id]);

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
      const walletMessage = result.passed
        ? "Wallet record updated. This competency now includes the submitted task result in its evidence package."
        : "Wallet record updated. This attempt remains part of the competency evidence history.";
      setResultPercentage(result.percentage);
      setResultCorrectCount(result.correctCount);
      setResultTotalQuestions(result.totalQuestions);
      setResultMessage(walletMessage);
      setResultLabel(result.resultLabel);
      setPassed(result.passed);

      const { attemptId, ...taskBody } = task;
      const evaluatedAttempt: AttemptRecord = {
        ...attempt,
        status: result.passed ? "passed" : "submitted",
        passed: result.passed,
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
          resultLabel: result.resultLabel,
          passed: result.passed,
        }),
      };

      await saveAttempt(evaluatedAttempt);
      setAttempt(evaluatedAttempt);

      toast({
        title: result.resultLabel,
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
  }, [task, attempt, activeSkill, userId, answers, currentQuestionIndex, questionEndsAt, saveAttempt]);

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

  const openSkill = useCallback(async (skill: DeclaredSkill) => {
    setActiveSkill(skill);
    setGenerateError(null);
    setTaskLoading(true);

    try {
      const restoredFromStorage = hydratePracticalTaskState(skill.id);
      if (restoredFromStorage) {
        const existing = attemptsMap[skill.id] ?? null;
        if (existing) {
          void syncAttemptResultFromServer(skill.id, existing);
        }
        return;
      }

      const existing = attemptsMap[skill.id] ?? null;
      if (existing) {
        applyStoredState(restoreFromAttemptRecord(existing));
        void syncAttemptResultFromServer(skill.id, existing);
        return;
      }

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
    } finally {
      setTaskLoading(false);
    }
  }, [applyStoredState, attemptsMap, hydratePracticalTaskState, syncAttemptResultFromServer]);

  useEffect(() => {
    if (!userId || skillsLoading || modalRestoredRef.current) return;

    const savedSkillId = localStorage.getItem(practicalTaskModalKey(userId));
    if (!savedSkillId) return;

    const skill = skills.find((s) => s.id === savedSkillId);
    if (!skill) return;

    modalRestoredRef.current = true;
    void openSkill(skill);
  }, [userId, skillsLoading, skills, openSkill]);

  const startMcqAttempt = async () => {
    if (!activeSkill) return;

    resetPracticalTaskState(activeSkill.id);
    setGeneratingMcqs(true);

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
    refresh();
  };

  const statusBadge = (skill: DeclaredSkill) => {
    const a = getAttempt(skill.id);
    const locked = isAttemptLocked(skill, a);
    if (!a) return <StatusBadge variant="neutral">No Attempt</StatusBadge>;
    if (a.status === "in_progress") return <StatusBadge variant="info">In Progress</StatusBadge>;
    if (a.status === "submitted" || a.status === "auto_submitted") {
      if (a.score != null) {
        return <StatusBadge variant="info">Submitted · {a.score}%</StatusBadge>;
      }
      return <StatusBadge variant="info">Submitted</StatusBadge>;
    }
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
              const decaying = isSkillDecaying(s);
              const lastDays = daysSince(s.lastRelatedActivityAt);
              return (
                <div key={s.id} className="flex flex-col md:flex-row md:items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">· {s.domain}</span>
                      {statusBadge(s)}
                      {decaying && (
                        <StatusBadge variant="warning" icon={<AlertTriangle className="h-3 w-3" />}>Skill decaying</StatusBadge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">MCQ practical task · {s.domain}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
                      {locked && <> · Locked until next credential sync</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (a.status === "submitted" || a.status === "auto_submitted") ? (
                      <Button variant="outline" onClick={() => void openSkill(s)}>
                        <Lock className="h-4 w-4 mr-1.5" />View attempt
                      </Button>
                    ) : a && a.status === "in_progress" ? (
                      <Button onClick={() => void openSkill(s)}>
                        <Timer className="h-4 w-4 mr-1.5" />Resume MCQ
                      </Button>
                    ) : (
                      <Button onClick={() => void openSkill(s)} disabled={locked && !a}>
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
            ) : !attempt ? (
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
            ) : task ? (
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
                      <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
                        <p>Test submitted successfully.</p>
                        <p className="font-medium">
                          Result: {resultPercentage ?? attempt.score ?? "—"}%
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
                        <p className="text-muted-foreground">
                          Competency wallet record updated.
                          {!passed && resultLabel === "Needs Improvement" && (
                            <> The failed attempt remains visible in your evidence history.</>
                          )}
                        </p>
                        {resultMessage && (
                          <p className="text-muted-foreground text-xs">{resultMessage}</p>
                        )}
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
    </AppShell>
  );
}

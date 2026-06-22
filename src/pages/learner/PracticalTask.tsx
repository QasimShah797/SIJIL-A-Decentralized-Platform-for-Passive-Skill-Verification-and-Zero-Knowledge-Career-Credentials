import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Play, Timer, Lock, Send, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";
import { isSkillDecaying, daysSince, type DeclaredSkill, type AttemptRecord, type SkillTask } from "@/lib/sijil-data";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useAuth } from "@/hooks/useAuth";
import {
  loadAttempts,
  saveAttemptDb,
  markAttemptPassed,
  isAttemptLocked,
} from "@/lib/db/practical-attempts";
import { updateSkillPipelineStage } from "@/lib/db/skills";
import { createInstitutionAttestationRequest, hasPendingAttestationRequest } from "@/lib/db/institution-attestation-requests";
import { fetchLearnerProfile } from "@/lib/db/learner-profile";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGitHub } from "@/hooks/useGitHub";

type TaskWithInstructions = SkillTask & {
  scenario?: string;
  instructions?: string;
  acceptance_criteria?: string[];
  evaluation_rubric?: Record<string, unknown>;
  hidden_test_ideas?: string[];
};

function isGenericTask(task: Partial<TaskWithInstructions> | null | undefined): boolean {
  if (!task) return true;
  return (
    task.prompt?.includes("Complete a practical demonstration") === true ||
    task.title?.startsWith("Demonstrate ") === true ||
    task.expectedDeliverable === "Written response or code in the editor."
  );
}

async function generateTaskFromRapidTask(
  skill: { id?: string; name: string; domain: string },
  githubRepos: { name: string; language: string | null; full_name: string }[],
  skillId: string,
): Promise<{ task: TaskWithInstructions; fallback?: boolean }> {
  const { data, error } = await supabase.functions.invoke("rapid-task", {
    body: {
      action: "generate",
      skill: { name: skill.name, domain: skill.domain },
      repos: githubRepos,
    },
  });

  console.log("Generated task from rapid-task:", data);
  console.log("Generate task error:", error);

  if (error || data?.error) {
    throw new Error(
      data?.details || data?.error || error?.message || "Task generation failed. Please try again.",
    );
  }

  if (!data?.prompt && !data?.scenario && !data?.instructions) {
    throw new Error("No task details were returned from rapid-task.");
  }

  const generatedTask: TaskWithInstructions = {
    skillId,
    title: data.title,
    type: data.type ?? "Coding",
    durationMinutes: data.durationMinutes ?? 20,
    prompt: data.prompt,
    scenario: data.scenario,
    instructions: data.instructions,
    starterCode: data.starterCode || undefined,
    expectedDeliverable: data.expectedDeliverable,
    acceptance_criteria: data.acceptance_criteria || [],
    evaluation_rubric: data.evaluation_rubric || [],
    hidden_test_ideas: data.hidden_test_ideas || [],
  };

  console.log("Stored currentTask:", generatedTask);

  if (!data?.fallback && isGenericTask(generatedTask)) {
    throw new Error("Task generation failed: generic fallback task returned.");
  }

  return { task: generatedTask, fallback: data?.fallback === true };
}

type EvalData = {
  passed?: boolean;
  feedback?: string;
  score?: number;
  criteria_results?: Record<string, unknown>[];
  error?: string;
  details?: string;
  evaluationUnavailable?: boolean;
  evaluation?: { evaluationUnavailable?: boolean; criteria_results?: Record<string, unknown>[] };
};

async function evaluateSubmissionWithAI(
  task: SkillTask | null,
  submission: string,
  skill: { name: string; domain?: string | null },
): Promise<EvalData | null> {
  if (!task || !submission.trim()) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke("rapid-task", {
    body: {
      action: "evaluate",
      skill: { name: skill.name, domain: skill.domain ?? "General" },
      task,
      submission,
    },
  });

  console.log("Evaluation data:", data);
  console.log("Evaluation error:", error);

  if (error || data?.error) {
    console.log("Evaluation invoke error:", data?.details || data?.error || error?.message);
    return {
      evaluationUnavailable: true,
      feedback: data?.details || data?.error || error?.message || "Please try again.",
    };
  }

  return data as EvalData;
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

export default function PracticalTask() {
  const { user } = useAuth();
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const { repos } = useGitHub();
  const [attemptsMap, setAttemptsMap] = useState<Record<string, AttemptRecord>>({});
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    if (!user) return;
    loadAttempts(user.id, skills.map((s) => s.id)).then(setAttemptsMap);
  }, [user, skills]);

  const getAttempt = (skillId: string) => attemptsMap[skillId] ?? null;
  const saveAttempt = async (rec: AttemptRecord) => {
    if (!user) return;
    await saveAttemptDb(user.id, rec);
    setAttemptsMap((m) => ({ ...m, [rec.skillId]: rec }));
  };

  const [activeSkill, setActiveSkill] = useState<DeclaredSkill | null>(null);
  const [task, setTask] = useState<TaskWithInstructions | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [submission, setSubmission] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  const runEvaluation = (
    currentAttempt: AttemptRecord,
    currentSkill: DeclaredSkill,
    currentTask: SkillTask | null,
    currentSubmission: string,
  ) => {
    setEvaluating(true);
    return evaluateSubmissionWithAI(currentTask, currentSubmission, {
      name: currentSkill.name,
      domain: currentSkill.domain,
    }).then((data) => {
      if (!data) {
        toast({
          title: "Evaluation unavailable",
          description: "Your submission was saved. Click “Retry evaluation” — Groq is used if Gemini is busy.",
          variant: "destructive",
        });
        return false;
      }

      if (data.evaluationUnavailable || data.evaluation?.evaluationUnavailable) {
        toast({
          title: "Evaluation unavailable",
          description:
            data.feedback
            || "Your submission was saved. Click “Retry evaluation” — Groq is used if Gemini is busy.",
          variant: "destructive",
        });
        return false;
      }

      if (data.passed === false) {
        toast({
          title: "Task not passed",
          description: data.feedback || "Task not passed. Review feedback and try again.",
          variant: "destructive",
        });
        return false;
      }

      if (!data.passed || !user) return false;

      const score = data.score ?? 0;
      const feedback = data.feedback || "";
      const criteriaResults = data.criteria_results
        ?? data.evaluation?.criteria_results
        ?? [];
      const passedAttempt: AttemptRecord = {
        ...currentAttempt,
        status: "passed",
        submission: currentSubmission,
        passed: true,
        score,
        feedback,
      };

      markAttemptPassed(user.id, passedAttempt, score, feedback)
        .then(async () => {
          setAttempt(passedAttempt);
          await updateSkillPipelineStage(
            user.id,
            currentSkill.id,
            "institution_attestation_pending",
            "pending_institution_attestation",
          );
          const profile = await fetchLearnerProfile(user.id, user.email);

          const pending = await hasPendingAttestationRequest(user.id, currentSkill.id);
          if (!pending) {
            const { data: skillRow } = await supabase
              .from("declared_skills")
              .select("created_at")
              .eq("id", currentSkill.id)
              .eq("user_id", user.id)
              .maybeSingle();

            await createInstitutionAttestationRequest({
              userId: user.id,
              userEmail: user.email ?? "",
              profile,
              skill: {
                ...currentSkill,
                createdAt: skillRow?.created_at as string | undefined,
              },
              task: currentTask,
              attempt: passedAttempt,
              submission: currentSubmission,
              evaluation: {
                passed: true,
                score,
                feedback,
                criteriaResults,
              },
            });
          }
          toast({
            title: "Task passed",
            description: "Task passed. Your competency has been sent to your institution for attestation.",
          });
          refresh();
          return true;
        })
        .catch((err) => {
          toast({
            title: "Could not update competency status",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
          return false;
        });
    }).finally(() => setEvaluating(false));
  };

  const retryEvaluation = () => {
    if (!attempt || !activeSkill || !submission.trim()) {
      toast({
        title: "Nothing to evaluate",
        description: "Open your submitted attempt and try again.",
        variant: "destructive",
      });
      return;
    }
    void runEvaluation(attempt, activeSkill, task, submission);
  };

  // Tick while an attempt is in progress
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [attempt?.attemptId, attempt?.status]);

  const remainingMs = useMemo(() => {
    if (!attempt) return 0;
    return new Date(attempt.endsAt).getTime() - now;
  }, [attempt, now]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    if (remainingMs > 0) return;
    const finalStatus: AttemptRecord["status"] = submission.trim()
      ? "auto_submitted"
      : "expired_no_submission";
    const updated: AttemptRecord = { ...attempt, status: finalStatus, submission };
    saveAttempt(updated).then(async () => {
      setAttempt(updated);
      toast({
        title: finalStatus === "auto_submitted" ? "Time up — auto-submitted" : "Time up — no submission recorded",
        description: finalStatus === "auto_submitted"
          ? "Your work was captured and locked against this skill."
          : "Attempt closed with no artifact. New attempt available only after next credential sync.",
        variant: finalStatus === "auto_submitted" ? "default" : "destructive",
      });
      if (finalStatus === "auto_submitted" && activeSkill && user) {
        await updateSkillPipelineStage(user.id, activeSkill.id, "practical_task");
        runEvaluation(updated, activeSkill, task, submission);
      }
      refresh();
    }).catch((err) => {
      toast({
        title: "Could not save attempt",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    });
  }, [remainingMs, attempt?.status, submission]);

  const openSkill = async (skill: DeclaredSkill) => {
    setActiveSkill(skill);
    setSubmission("");
    setAttempt(null);
    setTask(null);
    setTaskLoading(true);
    try {
      const matchedRepos = repos.filter(r =>
        r.language?.toLowerCase().includes(skill.name.toLowerCase()) ||
        skill.name.toLowerCase().includes((r.language ?? "").toLowerCase())
      );
      const { task: generatedTask, fallback } = await generateTaskFromRapidTask(
        { name: skill.name, domain: skill.domain ?? "General" },
        matchedRepos,
        skill.id,
      );
      setTask(generatedTask);

      if (fallback) {
        toast({
          title: "AI quota reached",
          description: "A local skill-specific task was generated for this attempt.",
        });
      }

      const existing = getAttempt(skill.id);
      if (existing && !isGenericTask(generatedTask)) {
        setAttempt(existing);
        setSubmission(existing.submission ?? "");
      } else {
        setAttempt(null);
      }
    } catch (err) {
      setTask(null);
      toast({
        title: "Task generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setTaskLoading(false);
    }
  };

  const startAttempt = () => {
    if (!activeSkill || !task) return;
    const start = new Date();
    const end = new Date(start.getTime() + task.durationMinutes * 60 * 1000);
    const rec: AttemptRecord = {
      skillId: activeSkill.id,
      attemptId: genAttemptId(),
      startedAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMinutes: task.durationMinutes,
      status: "in_progress",
      submission: "",
      credentialSyncSnapshot: activeSkill.lastCredentialSyncAt ?? null,
    };
    saveAttempt(rec).then(() => {
      setAttempt(rec);
      setSubmission("");
      setNow(Date.now());
      toast({ title: "Attempt started", description: `Timer running · ${task.durationMinutes} min window.` });
    });
  };

  const submitNow = () => {
    if (!attempt || !activeSkill || !user) return;
    const updated: AttemptRecord = { ...attempt, status: "submitted", submission };
    saveAttempt(updated).then(async () => {
      setAttempt(updated);
      await updateSkillPipelineStage(user.id, activeSkill.id, "practical_task");
      toast({ title: "Submitted", description: "Submission locked against this skill." });
      runEvaluation(updated, activeSkill, task, submission);
    }).catch((err) => {
      toast({
        title: "Could not save submission",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    });
  };

  const closePanel = () => {
    setActiveSkill(null); setTask(null); setAttempt(null); setSubmission("");
    refresh();
  };

  const statusBadge = (skill: DeclaredSkill) => {
    const a = getAttempt(skill.id);
    const locked = isAttemptLocked(skill, getAttempt(skill.id));
    if (!a) return <StatusBadge variant="neutral">No Attempt</StatusBadge>;
    if (a.status === "in_progress") return <StatusBadge variant="info">In Progress</StatusBadge>;
    if (a.status === "passed") return <StatusBadge variant="verified" icon={<CheckCircle2 className="h-3 w-3" />}>Passed</StatusBadge>;
    if (a.status === "submitted") return <StatusBadge variant="info">Submitted</StatusBadge>;
    if (a.status === "auto_submitted") return <StatusBadge variant="info">Auto-Submitted</StatusBadge>;
    if (a.status === "expired_no_submission") return <StatusBadge variant="warning">No Submission</StatusBadge>;
    return locked ? <StatusBadge variant="neutral">Locked</StatusBadge> : <StatusBadge variant="neutral">Available</StatusBadge>;
  };

  const learnerQuestion = useMemo(() => {
    if (!task) return null;
    return task.scenario || task.instructions || task.prompt || null;
  }, [task]);

  if (skillsLoading) {
    return <AppShell role="learner"><div className="text-sm text-muted-foreground">Loading skills…</div></AppShell>;
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Practical Tasks"
        description="Tasks are generated from your synced skills. One attempt per skill until the next credential sync. Timer is bound to task type and starts the moment you open the task."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill-bound tasks</CardTitle>
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
                    <div className="text-xs text-muted-foreground mt-1">
                      Practical task · generated when you start · {s.domain}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
                      {locked && <> · Locked until next credential sync</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (a.status === "submitted" || a.status === "passed" || a.status === "auto_submitted" || a.status === "expired_no_submission") ? (
                      <Button variant="outline" onClick={() => openSkill(s)}>
                        <Lock className="h-4 w-4 mr-1.5" />View attempt
                      </Button>
                    ) : a && a.status === "in_progress" ? (
                      <Button onClick={() => openSkill(s)}>
                        <Timer className="h-4 w-4 mr-1.5" />Resume task
                      </Button>
                    ) : (
                      <Button onClick={() => openSkill(s)} disabled={locked && !a}>
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
        A skill becomes available for a new attempt only when fresh credentials sync from your institution.
      </p>

      {/* Task / attempt dialog */}
      <Dialog open={!!activeSkill} onOpenChange={(o) => { if (!o) closePanel(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden gap-4">
          {activeSkill && (
            taskLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Generating your task…</span>
              </div>
            ) : task ? (
              <>
                <DialogHeader className="shrink-0 pr-8">
                  <DialogTitle className="flex items-center gap-2">
                    {task.title}
                    <span className="text-xs text-muted-foreground font-normal">· {activeSkill.name}</span>
                  </DialogTitle>
                  <DialogDescription>
                    {task.type} · {task.durationMinutes}-minute window. Timer starts when you click Start.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2">
                  {!attempt ? (
                    <div className="rounded-lg border-2 border-dashed border-border p-6 text-center bg-muted/30">
                      <Lock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <div className="text-sm font-medium">Task is hidden until you start the attempt.</div>
                      <div className="text-xs text-muted-foreground mt-1">One attempt per skill until next credential sync.</div>
                      <Button className="mt-4" onClick={startAttempt} disabled={taskLoading || !learnerQuestion}>
                        <Play className="h-4 w-4 mr-1.5" />Start task
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">Attempt</span>
                          <span className="mono text-xs">{attempt.attemptId}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="mono">
                            {attempt.status === "in_progress" ? fmt(remainingMs) : "00:00"}
                          </span>
                          <span className="ml-2">{
                            attempt.status === "in_progress" ? <StatusBadge variant="info">In Progress</StatusBadge> :
                            attempt.status === "passed" ? <StatusBadge variant="verified">Passed</StatusBadge> :
                            attempt.status === "submitted" ? <StatusBadge variant="info">Submitted</StatusBadge> :
                            attempt.status === "auto_submitted" ? <StatusBadge variant="info">Auto-Submitted</StatusBadge> :
                            <StatusBadge variant="warning">No Submission</StatusBadge>
                          }</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="text-sm font-medium mb-1">Scenario</div>
                          {learnerQuestion ? (
                            <p className="text-sm text-muted-foreground leading-relaxed select-text">{learnerQuestion}</p>
                          ) : (
                            <p className="text-red-500 text-sm">
                              Task details are missing. Please generate a new task.
                            </p>
                          )}
                        </div>

                        {task.starterCode && (
                          <div>
                            <div className="text-sm font-medium mb-1">Starter</div>
                            <pre className="text-xs bg-muted/60 border rounded-md p-3 overflow-x-auto overflow-y-auto max-h-48 mono whitespace-pre select-text">
                              {task.starterCode}
                            </pre>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground mt-2">
                          You can select and copy the scenario and starter code into your answer below.
                        </p>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-1">Your work</div>
                        <Textarea
                          value={submission}
                          onChange={(e) => setSubmission(e.target.value)}
                          placeholder="Write or paste your code/answer here…"
                          rows={10}
                          className="mono text-xs min-h-[10rem] max-h-64 resize-y overflow-y-auto"
                          disabled={attempt.status !== "in_progress"}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="shrink-0">
                  {attempt && attempt.status === "in_progress" ? (
                    <Button onClick={submitNow} disabled={evaluating}>
                      <Send className="h-4 w-4 mr-1.5" />Submit attempt
                    </Button>
                  ) : attempt && (attempt.status === "submitted" || attempt.status === "auto_submitted") ? (
                    <>
                      <Button variant="outline" onClick={closePanel}>Close</Button>
                      <Button onClick={retryEvaluation} disabled={evaluating || !submission.trim()}>
                        <RefreshCcw className={`h-4 w-4 mr-1.5 ${evaluating ? "animate-spin" : ""}`} />
                        {evaluating ? "Evaluating…" : "Retry evaluation"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={closePanel}>Close</Button>
                  )}
                </DialogFooter>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-16 gap-3 min-h-0">
                <p className="text-red-500 text-sm text-center px-4">
                  Task details are missing. Please generate a new task.
                </p>
                <Button onClick={() => openSkill(activeSkill)}>
                  <RefreshCcw className="h-4 w-4 mr-1.5" />Generate new task
                </Button>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

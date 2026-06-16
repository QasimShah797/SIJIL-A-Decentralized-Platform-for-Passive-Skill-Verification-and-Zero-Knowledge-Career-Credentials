import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { getTaskForSkill, isAttemptLocked, isSkillDecaying, daysSince, type DeclaredSkill, type AttemptRecord, type SkillTask } from "@/lib/sijil-data";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useAuth } from "@/hooks/useAuth";
import { fetchAttempts, saveAttemptDb } from "@/lib/db/practical-attempts";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGitHub } from "@/hooks/useGitHub";
import { cn } from "@/lib/utils";

type TaskWithInstructions = SkillTask & {
  scenario?: string;
  instructions?: string;
};

function blockCopyFromProtectedArea(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const isProtected = target.closest("[data-protected-task-text]");

  if (isProtected && (e.ctrlKey || e.metaKey) && ["c", "x", "a"].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
}

function ProtectedTaskText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("select-none cursor-default", className)}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-protected-task-text]")) {
          e.preventDefault();
        }
      }}
      onKeyDown={blockCopyFromProtectedArea}
      data-protected-task-text
    >
      {children}
    </div>
  );
}

async function generateTaskWithAI(
  skill: { name: string; domain: string },
  githubRepos: { name: string; language: string | null; full_name: string }[]
): Promise<Partial<SkillTask>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return {};
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rapid-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "generate", skill, repos: githubRepos }),
    });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

type EvalData = {
  passed?: boolean;
  feedback?: string;
  score?: number;
  error?: string;
  details?: string;
  evaluationUnavailable?: boolean;
  evaluation?: { evaluationUnavailable?: boolean };
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
    fetchAttempts(user.id).then(setAttemptsMap);
  }, [user, skills.length]);

  const getAttempt = (skillId: string) => attemptsMap[skillId] ?? null;
  const saveAttempt = async (rec: AttemptRecord) => {
    if (!user) return;
    await saveAttemptDb(user.id, rec);
    setAttemptsMap((m) => ({ ...m, [rec.skillId]: rec }));
  };

  // Active attempt panel state
  const [activeSkill, setActiveSkill] = useState<DeclaredSkill | null>(null);
  const [task, setTask] = useState<SkillTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [submission, setSubmission] = useState("");
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

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
    saveAttempt(updated).then(() => {
      setAttempt(updated);
      toast({
        title: finalStatus === "auto_submitted" ? "Time up — auto-submitted" : "Time up — no submission recorded",
        description: finalStatus === "auto_submitted"
          ? "Your work was captured and locked against this skill."
          : "Attempt closed with no artifact. New attempt available only after next credential sync.",
        variant: finalStatus === "auto_submitted" ? "default" : "destructive",
      });
      refresh();
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
      const aiTask = await generateTaskWithAI(
        { name: skill.name, domain: skill.domain ?? "General" },
        matchedRepos
      );
      if (aiTask?.title) {
        setTask(aiTask as SkillTask);
      } else {
        setTask(getTaskForSkill(skill));
      }
    } catch {
      setTask(getTaskForSkill(skill));
    } finally {
      setTaskLoading(false);
    }
    const existing = getAttempt(skill.id);
    // Only restore existing attempt if it has a real AI-generated task
    // (not the old static fallback task)
    if (existing && task && task.prompt !== `Complete a practical demonstration of your ${skill.name} skills. Submit your work below.`) {
      setAttempt(existing);
    } else {
      setAttempt(null);
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
    if (!attempt) return;
    const updated: AttemptRecord = { ...attempt, status: "submitted", submission };
    saveAttempt(updated).then(() => {
      setAttempt(updated);
      toast({ title: "Submitted", description: "Submission locked against this skill." });
      evaluateSubmissionWithAI(task, submission, {
        name: activeSkill!.name,
        domain: activeSkill!.domain,
      }).then((data) => {
        if (!data) {
          toast({
            title: "Evaluation unavailable",
            description: "Your submission was received, but automatic evaluation could not run.",
            variant: "destructive",
          });
          return;
        }

        if (data.evaluationUnavailable || data.evaluation?.evaluationUnavailable) {
          toast({
            title: "Evaluation unavailable",
            description:
              data.feedback ||
              "Your submission was received, but automatic evaluation is temporarily unavailable.",
            variant: "destructive",
          });
          return;
        }

        if (data.passed === false) {
          toast({
            title: "Task not passed",
            description: data.feedback || "Your submission did not meet the rubric.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Task passed",
          description: data.feedback || "Your submission passed evaluation.",
        });

        if (data.passed) {
          supabase.from("declared_skills")
            .update({ status: "Evidence Linked", last_related_activity_at: new Date().toISOString() })
            .eq("id", activeSkill!.id).eq("user_id", user?.id ?? "");
        }
      });
    });
  };

  const closePanel = () => {
    setActiveSkill(null); setTask(null); setAttempt(null); setSubmission("");
    refresh();
  };

  const statusBadge = (skill: DeclaredSkill) => {
    const a = getAttempt(skill.id);
    const locked = isAttemptLocked(skill);
    if (!a) return <StatusBadge variant="neutral">No Attempt</StatusBadge>;
    if (a.status === "in_progress") return <StatusBadge variant="info">In Progress</StatusBadge>;
    if (a.status === "submitted") return <StatusBadge variant="verified" icon={<CheckCircle2 className="h-3 w-3" />}>Submitted</StatusBadge>;
    if (a.status === "auto_submitted") return <StatusBadge variant="info">Auto-Submitted</StatusBadge>;
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
        description="Tasks are generated from your synced skills. One attempt per skill until the next credential sync. Timer is bound to task type and starts the moment you open the task."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill-bound tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {skills.map((s) => {
              const t = getTaskForSkill(s);
              const a = getAttempt(s.id);
              const locked = isAttemptLocked(s);
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
                      {t ? <>Task: <span className="text-foreground">{t.title}</span> · {t.type} · {t.durationMinutes} min</> : "No task defined yet"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last related sync: {lastDays === null ? "never" : `${lastDays}d ago`}
                      {locked && <> · Locked until next credential sync</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (a.status === "submitted" || a.status === "auto_submitted" || a.status === "expired_no_submission") ? (
                      <Button variant="outline" onClick={() => openSkill(s)}>
                        <Lock className="h-4 w-4 mr-1.5" />View attempt
                      </Button>
                    ) : a && a.status === "in_progress" ? (
                      <Button onClick={() => openSkill(s)}>
                        <Timer className="h-4 w-4 mr-1.5" />Resume task
                      </Button>
                    ) : (
                      <Button onClick={() => openSkill(s)} disabled={!t}>
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
                      <Button className="mt-4" onClick={startAttempt} disabled={taskLoading}>
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
                            attempt.status === "submitted" ? <StatusBadge variant="verified">Submitted</StatusBadge> :
                            attempt.status === "auto_submitted" ? <StatusBadge variant="info">Auto-Submitted</StatusBadge> :
                            <StatusBadge variant="warning">No Submission</StatusBadge>
                          }</span>
                        </div>
                      </div>

                      <ProtectedTaskText className="space-y-4">
                        <div>
                          <div className="text-sm font-medium mb-1">Prompt</div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{task.prompt}</p>
                        </div>

                        {(task as TaskWithInstructions).scenario &&
                          (task as TaskWithInstructions).scenario !== task.prompt && (
                          <div>
                            <div className="text-sm font-medium mb-1">Scenario</div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {(task as TaskWithInstructions).scenario}
                            </p>
                          </div>
                        )}

                        {(task as TaskWithInstructions).instructions &&
                          (task as TaskWithInstructions).instructions !== task.prompt && (
                          <div>
                            <div className="text-sm font-medium mb-1">Instructions</div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {(task as TaskWithInstructions).instructions}
                            </p>
                          </div>
                        )}

                        {task.starterCode && (
                          <div>
                            <div className="text-sm font-medium mb-1">Starter</div>
                            <pre className="text-xs bg-muted/60 border rounded-md p-3 overflow-x-auto overflow-y-auto max-h-48 mono whitespace-pre select-none cursor-default">
                              {task.starterCode}
                            </pre>
                          </div>
                        )}

                        <div>
                          <div className="text-sm font-medium mb-1">Expected</div>
                          <p className="text-[11px] text-muted-foreground">{task.expectedDeliverable}</p>
                        </div>

                        <p className="text-xs text-muted-foreground mt-2">
                          Copying task text is disabled to keep the attempt fair.
                        </p>
                      </ProtectedTaskText>

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
                    <Button onClick={submitNow}><Send className="h-4 w-4 mr-1.5" />Submit attempt</Button>
                  ) : (
                    <Button variant="outline" onClick={closePanel}>Close</Button>
                  )}
                </DialogFooter>
              </>
            ) : null
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

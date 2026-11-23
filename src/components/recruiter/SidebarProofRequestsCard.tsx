import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayRecruiterSkillName, type RecruiterSkillCard } from "@/components/recruiter/RecruiterSkillEvidence";
import {
  createGithubActivityRequest,
  createScoreRequest,
  getScoreRequest,
  listVerificationRequests,
  type ScoreRequestDecision,
  type ScoreRequestSummary,
  type VerificationRequestView,
} from "@/services/api/zkp.api";
import { cn } from "@/lib/utils";

const PRESENTATION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCORE_OPTIONS = [
  { value: 60, define: "Baseline pass — practical score at least 60." },
  { value: 70, define: "Hiring-ready — practical score at least 70." },
  { value: 80, define: "Strong proof — practical score at least 80." },
] as const;

const GITHUB_OPTIONS = [
  { value: 50 as const, define: "Light activity — ≥50 unique commits." },
  { value: 100 as const, define: "Active contributor — ≥100 unique commits." },
  { value: 150 as const, define: "Heavy activity — ≥150 unique commits." },
] as const;

type ScoreRowState = {
  threshold: number;
  request: ScoreRequestSummary | null;
  decision: ScoreRequestDecision | null;
  error: string | null;
};

type GithubRowState = {
  threshold: 50 | 100 | 150;
  request: VerificationRequestView | null;
  error: string | null;
};

type Props = {
  skills: RecruiterSkillCard[];
  learnerUserId: string;
  className?: string;
};

function scoreStatusText(request: ScoreRequestSummary | null, decision: ScoreRequestDecision | null): {
  label: string;
  tone: "neutral" | "pending" | "success" | "danger";
} {
  if (decision) {
    return decision.accepted
      ? { label: `Approved · meets ${decision.threshold}%`, tone: "success" }
      : { label: `Not approved · below ${decision.threshold}% or checks failed`, tone: "danger" };
  }
  if (!request) return { label: "No request yet", tone: "neutral" };
  switch (request.status) {
    case "open":
      return { label: "Pending · waiting for learner", tone: "pending" };
    case "declined":
      return { label: "Rejected by learner", tone: "danger" };
    case "consumed":
      return { label: "Submitted · checking result…", tone: "pending" };
    case "expired":
      return { label: "Expired", tone: "danger" };
    default:
      return { label: request.status, tone: "neutral" };
  }
}

function githubStatusText(request: VerificationRequestView | null): {
  label: string;
  tone: "neutral" | "pending" | "success" | "danger";
} {
  if (!request) return { label: "No request yet", tone: "neutral" };
  switch (request.status) {
    case "pending":
      return { label: "Pending · waiting for learner", tone: "pending" };
    case "approved":
    case "generating":
      return { label: "Approved · proof in progress", tone: "pending" };
    case "verified":
      return { label: `Approved · meets ${request.threshold ?? "—"} commits`, tone: "success" };
    case "unsatisfied":
      return { label: "Completed · threshold not met", tone: "danger" };
    case "rejected":
      return { label: "Rejected by learner", tone: "danger" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" };
    default:
      return { label: request.status, tone: "neutral" };
  }
}

function toneClass(tone: "neutral" | "pending" | "success" | "danger"): string {
  switch (tone) {
    case "success":
      return "text-emerald-700";
    case "danger":
      return "text-red-700";
    case "pending":
      return "text-amber-700";
    default:
      return "text-[#64748b]";
  }
}

export function SidebarProofRequestsCard({ skills, learnerUserId, className }: Props) {
  const requestable = useMemo(
    () => skills.filter((skill) => PRESENTATION_UUID.test(skill.presentationId)),
    [skills],
  );

  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [scoreRows, setScoreRows] = useState<Record<string, ScoreRowState>>({});
  const [githubRow, setGithubRow] = useState<GithubRowState>({
    threshold: 100,
    request: null,
    error: null,
  });

  const activeSkill = requestable.find((skill) => skill.id === activeSkillId) ?? requestable[0] ?? null;

  useEffect(() => {
    if (!requestable.length) {
      setActiveSkillId(null);
      return;
    }
    setActiveSkillId((current) => (
      current && requestable.some((skill) => skill.id === current)
        ? current
        : requestable[0].id
    ));
  }, [requestable]);

  const ensureScoreRow = (presentationId: string): ScoreRowState => (
    scoreRows[presentationId] ?? { threshold: 70, request: null, decision: null, error: null }
  );

  const patchScoreRow = (presentationId: string, patch: Partial<ScoreRowState>) => {
    setScoreRows((current) => ({
      ...current,
      [presentationId]: {
        ...(current[presentationId] ?? { threshold: 70, request: null, decision: null, error: null }),
        ...patch,
      },
    }));
  };

  useEffect(() => {
    let active = true;

    const loadScores = async () => {
      const next: Record<string, ScoreRowState> = {};
      await Promise.all(requestable.map(async (skill) => {
        const saved = sessionStorage.getItem(`sijil-score-request:${skill.presentationId}`);
        if (!saved) {
          next[skill.presentationId] = { threshold: 70, request: null, decision: null, error: null };
          return;
        }
        try {
          const loaded = await getScoreRequest(saved);
          if (!active) return;
          next[skill.presentationId] = {
            threshold: loaded.request.threshold || 70,
            request: loaded.request,
            decision: loaded.decision,
            error: null,
          };
        } catch {
          sessionStorage.removeItem(`sijil-score-request:${skill.presentationId}`);
          next[skill.presentationId] = { threshold: 70, request: null, decision: null, error: null };
        }
      }));
      if (active) setScoreRows(next);
    };

    const loadGithub = async () => {
      if (!learnerUserId) return;
      try {
        const result = await listVerificationRequests("recruiter");
        if (!active || result.available === false) return;
        const savedId = sessionStorage.getItem(`sijil-github-request:${learnerUserId}`);
        const mine = result.requests.filter(
          (row) => row.category === "github-activity" && row.learnerUserId === learnerUserId,
        );
        const current = mine.find((row) => row.id === savedId)
          ?? mine.find((row) => row.status === "pending" || row.status === "approved" || row.status === "generating")
          ?? mine[0]
          ?? null;
        if (current) sessionStorage.setItem(`sijil-github-request:${learnerUserId}`, current.id);
        setGithubRow((row) => ({
          ...row,
          threshold: (current?.threshold === 50 || current?.threshold === 100 || current?.threshold === 150)
            ? current.threshold
            : row.threshold,
          request: current,
          error: null,
        }));
      } catch {
        // Keep the card usable even if status lookup fails.
      }
    };

    void loadScores();
    void loadGithub();
    return () => { active = false; };
  }, [requestable, learnerUserId]);

  const requestScore = async (skill: RecruiterSkillCard) => {
    const key = `score:${skill.presentationId}`;
    const row = ensureScoreRow(skill.presentationId);
    setBusyKey(key);
    patchScoreRow(skill.presentationId, { error: null });
    try {
      const created = await createScoreRequest({
        presentationId: skill.presentationId,
        threshold: row.threshold,
      });
      sessionStorage.setItem(`sijil-score-request:${skill.presentationId}`, created.id);
      patchScoreRow(skill.presentationId, {
        request: created,
        decision: null,
        threshold: created.threshold || row.threshold,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^API \d+:\s*/i, "") : "Request failed";
      patchScoreRow(skill.presentationId, { error: message });
    } finally {
      setBusyKey(null);
    }
  };

  const refreshScore = async (skill: RecruiterSkillCard) => {
    const row = ensureScoreRow(skill.presentationId);
    if (!row.request) return;
    const key = `score:${skill.presentationId}`;
    setBusyKey(key);
    try {
      const loaded = await getScoreRequest(row.request.id);
      patchScoreRow(skill.presentationId, {
        request: loaded.request,
        decision: loaded.decision,
        threshold: loaded.request.threshold || row.threshold,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^API \d+:\s*/i, "") : "Could not refresh";
      patchScoreRow(skill.presentationId, { error: message });
    } finally {
      setBusyKey(null);
    }
  };

  const requestGithub = async () => {
    setBusyKey("github");
    setGithubRow((row) => ({ ...row, error: null }));
    try {
      const created = await createGithubActivityRequest(learnerUserId, githubRow.threshold);
      sessionStorage.setItem(`sijil-github-request:${learnerUserId}`, created.id);
      setGithubRow((row) => ({
        ...row,
        request: created,
        threshold: (created.threshold === 50 || created.threshold === 100 || created.threshold === 150)
          ? created.threshold
          : row.threshold,
        error: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^API \d+:\s*/i, "") : "Request failed";
      setGithubRow((row) => ({ ...row, error: message }));
    } finally {
      setBusyKey(null);
    }
  };

  const refreshGithub = async () => {
    if (!githubRow.request) return;
    setBusyKey("github");
    try {
      const result = await listVerificationRequests("recruiter");
      const next = result.requests.find((row) => row.id === githubRow.request?.id) ?? null;
      setGithubRow((row) => ({ ...row, request: next, error: next ? null : "Request not found" }));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^API \d+:\s*/i, "") : "Could not refresh";
      setGithubRow((row) => ({ ...row, error: message }));
    } finally {
      setBusyKey(null);
    }
  };

  if (requestable.length === 0 && !learnerUserId) return null;

  const githubStatus = githubStatusText(githubRow.request);
  const githubOpen = Boolean(
    githubRow.request && ["pending", "approved", "generating"].includes(githubRow.request.status),
  );
  const activeRow = activeSkill ? ensureScoreRow(activeSkill.presentationId) : null;
  const activeStatus = activeRow ? scoreStatusText(activeRow.request, activeRow.decision) : null;
  const activeBusy = activeSkill ? busyKey === `score:${activeSkill.presentationId}` : false;
  const activeWaiting = activeRow?.request?.status === "open";

  const scoreDefine = SCORE_OPTIONS.find((item) => item.value === activeRow?.threshold)?.define;
  const githubDefine = GITHUB_OPTIONS.find((item) => item.value === githubRow.threshold)?.define;

  return (
    <div className={cn("learner-stat-card p-5", className)}>
      <h3 className="text-sm font-semibold text-[#023E8A]">Proof requests</h3>

      {requestable.length > 0 && activeSkill && activeRow && activeStatus ? (
        <div className="mt-3 space-y-4">
          <div
            className="-mx-1 overflow-x-auto px-1"
            role="tablist"
            aria-label="Skills"
          >
            <div className="flex min-w-max border-b border-[#e2e8f0]">
              {requestable.map((skill) => {
                const selected = skill.id === activeSkill.id;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveSkillId(skill.id)}
                    className={cn(
                      "relative shrink-0 px-3 pb-2.5 pt-1 text-[11px] transition-colors",
                      selected
                        ? "font-bold text-[#023E8A]"
                        : "font-medium text-[#94a3b8] hover:text-[#64748b]",
                    )}
                  >
                    <span className="block max-w-[7.5rem] truncate">
                      {displayRecruiterSkillName(skill.name)}
                    </span>
                    <span
                      className={cn(
                        "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-all",
                        selected ? "bg-[#023E8A] opacity-100" : "bg-transparent opacity-0",
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                  Score threshold
                </label>
                <input
                  type="range"
                  min={0}
                  max={SCORE_OPTIONS.length - 1}
                  step={1}
                  value={Math.max(0, SCORE_OPTIONS.findIndex((item) => item.value === activeRow.threshold))}
                  disabled={activeBusy || activeWaiting}
                  aria-label="Score threshold"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#e8eef7] accent-[#023E8A] disabled:cursor-not-allowed disabled:opacity-60"
                  onChange={(event) => {
                    const next = SCORE_OPTIONS[Number(event.target.value)]?.value ?? 70;
                    patchScoreRow(activeSkill.presentationId, { threshold: next });
                  }}
                />
                <div className="flex justify-between text-[10px] font-medium text-[#94a3b8]">
                  {SCORE_OPTIONS.map((item) => (
                    <span
                      key={item.value}
                      className={cn(activeRow.threshold === item.value && "text-[#023E8A]")}
                    >
                      {item.value}%
                    </span>
                  ))}
                </div>
                <p className="text-[11px] leading-snug text-[#334155]">
                  <span className="font-semibold text-[#023E8A]">{activeRow.threshold}%</span>
                  {" — "}
                  {scoreDefine}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-1.5 pt-4">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg bg-[#023E8A] px-3 text-[11px] text-white hover:bg-[#012A5C]"
                  disabled={activeBusy || busyKey !== null || activeWaiting}
                  onClick={() => void requestScore(activeSkill)}
                >
                  {activeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Request
                </Button>
                {activeRow.request ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2 text-[10px] text-[#64748b]"
                    disabled={activeBusy || busyKey !== null}
                    onClick={() => void refreshScore(activeSkill)}
                  >
                    Refresh
                  </Button>
                ) : null}
              </div>
            </div>

            <p className={cn("text-[11px] font-medium", toneClass(activeStatus.tone))}>
              Status: {activeStatus.label}
            </p>
            {activeRow.error ? <p className="text-[11px] text-red-700">{activeRow.error}</p> : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[#94a3b8]">No shared skills available.</p>
      )}

      {learnerUserId ? (
        <div className="mt-4 space-y-2 border-t border-[#e2e8f0] pt-4">
          <p className="text-xs font-semibold text-[#0f172a]">GitHub activity</p>

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                Commit threshold
              </label>
              <input
                type="range"
                min={0}
                max={GITHUB_OPTIONS.length - 1}
                step={1}
                value={Math.max(0, GITHUB_OPTIONS.findIndex((item) => item.value === githubRow.threshold))}
                disabled={busyKey === "github" || githubOpen}
                aria-label="Commit threshold"
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#e8eef7] accent-[#14b8a6] disabled:cursor-not-allowed disabled:opacity-60"
                onChange={(event) => {
                  const next = GITHUB_OPTIONS[Number(event.target.value)]?.value ?? 100;
                  setGithubRow((row) => ({ ...row, threshold: next }));
                }}
              />
              <div className="flex justify-between text-[10px] font-medium text-[#94a3b8]">
                {GITHUB_OPTIONS.map((item) => (
                  <span
                    key={item.value}
                    className={cn(githubRow.threshold === item.value && "text-teal-700")}
                  >
                    {item.value}
                  </span>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-[#334155]">
                <span className="font-semibold text-teal-700">{githubRow.threshold}</span>
                {" — "}
                {githubDefine}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-1.5 pt-4">
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-lg bg-teal-600 px-3 text-[11px] text-white hover:bg-teal-700"
                disabled={busyKey !== null || githubOpen}
                onClick={() => void requestGithub()}
              >
                {busyKey === "github" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Request
              </Button>
              {githubRow.request ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg px-2 text-[10px] text-[#64748b]"
                  disabled={busyKey !== null}
                  onClick={() => void refreshGithub()}
                >
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>

          <p className={cn("text-[11px] font-medium", toneClass(githubStatus.tone))}>
            Status: {githubStatus.label}
          </p>
          {githubRow.error ? <p className="text-[11px] text-red-700">{githubRow.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

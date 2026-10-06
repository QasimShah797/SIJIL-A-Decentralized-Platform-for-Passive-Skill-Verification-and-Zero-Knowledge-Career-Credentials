import { useState } from "react";
import { Check, ChevronRight, ListFilter, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import { getEvidenceStats, matchedBarPercent } from "@/lib/recruiter-evidence";
import { buildFallbackMatchAnswer } from "@/lib/recruiter-match-fallback";
import type { MatchBasis, RecruiterMatchAnswer } from "@/lib/recruiter-match-response";
import { useRecruiterMatch } from "@/hooks/useRecruiterMatch";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Compare the selected candidates on TypeScript",
  "Who has the strongest verified frontend evidence?",
  "Rank candidates for a junior full-stack role",
  "Which candidates have skills without supporting evidence?",
  "Show candidates with Java and Mobile App Development",
  "Where is each candidate strongest and weakest?",
];

const FALLBACK_CODES = new Set(["UPSTREAM", "UPSTREAM_HTTP", "UPSTREAM_EMPTY", "UPSTREAM_BLOCKED", "UPSTREAM_TRUNCATED", "BAD_JSON", "NOT_FOUND", "UNKNOWN"]);

function evidenceLine(basis: MatchBasis): string {
  const corroborating = Math.max(0, basis.evidence - basis.verifiedEvidence);
  return `${basis.credentials} credentials · ${basis.evidence} evidence · ${basis.verifiedEvidence} verified (LMS) · ${corroborating} corroborating`;
}

function failureCopy(code: string): string {
  if (code === "AUTH") return "Sign in as a recruiter to use live matching.";
  if (code === "NOT_FOUND") return "The match service was not found.";
  if (code === "UPSTREAM" || code === "UPSTREAM_EMPTY") return "The model did not return an answer.";
  if (code === "UPSTREAM_HTTP") return "The model service rejected the request.";
  if (code === "UPSTREAM_BLOCKED") return "The model blocked this request.";
  if (code === "UPSTREAM_TRUNCATED") return "The model answer was cut off.";
  if (code === "BAD_JSON") return "The match service returned an unusable answer.";
  if (code === "NETWORK") return "The match service could not be reached.";
  return "Live matching did not respond.";
}

export function SijilMatchBot({
  candidates,
  candidateSkills = {},
  onOpenCandidate,
  selectedIds = [],
  onClearSelection,
  onResultIds,
}: {
  candidates: CandidateView[];
  candidateSkills?: Record<string, CandidateSkill[]>;
  onOpenCandidate: (id: string) => void;
  onCompare?: (leftId: string, rightId: string) => void;
  selectedIds?: string[];
  onClearSelection?: () => void;
  onResultIds?: (ids: string[] | null) => void;
}) {
  const [input, setInput] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [fallback, setFallback] = useState<RecruiterMatchAnswer | null>(null);
  const [failureDetail, setFailureDetail] = useState<{ code: string; status: number | null; upstreamMessage: string | null } | null>(null);
  const { ask, data, status, error, reset } = useRecruiterMatch();
  const names = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));

  const submit = (question: string) => {
    const text = question.trim();
    if (!text || status === "loading") return;
    setInput(text);
    setLastQuestion(text);
    setFallback(null);
    setFailureDetail(null);
    const pool = selectedIds.length
      ? candidates.filter((candidate) => selectedIds.includes(candidate.id))
      : candidates;
    void ask(text, {
      candidateIds: selectedIds,
      allowedIds: candidates.map((candidate) => candidate.id),
    }).then((result) => {
      if (!result || result.stale || result.answer) return;
      if (result.code === "AUTH" || result.code === "RATE") return;
      if (result.code && !FALLBACK_CODES.has(result.code)) return;
      const local = buildFallbackMatchAnswer(text, pool, candidateSkills);
      setFailureDetail({ code: result.code ?? "UNKNOWN", status: result.status, upstreamMessage: result.upstreamMessage ?? null });
      setFallback(local);
      onResultIds?.(local.candidates.map((candidate) => candidate.id));
    });
  };

  const showResults = status === "loading" || status === "error" || status === "success";

  return (
    <div className="relative w-full">
      <form
        className="flex h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 shadow-md transition duration-200 focus-within:border-primary/40 focus-within:shadow-[var(--shadow-glow)]"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-sidebar-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </span>
        <label className="sr-only" htmlFor="sijil-match-question">Ask SIJIL Match</label>
        <input
          id="sijil-match-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask SIJIL Match…"
          maxLength={500}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <Button
          type="submit"
          size="sm"
          className="h-10 w-10 shrink-0 rounded-full p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={status === "loading" || !input.trim()}
          aria-label="Ask SIJIL Match"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {selectedIds.length > 0 ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-foreground shadow-sm">
          Asking about {selectedIds.length} selected
          {onClearSelection ? (
            <button type="button" onClick={onClearSelection} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Clear selected candidates">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </p>
      ) : null}

      {status === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.slice(0, 5).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => submit(suggestion)}
              className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-left text-xs font-medium text-muted-foreground shadow-sm transition duration-200 hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {showResults ? (
        <section
          aria-live="polite"
          className="mt-3 animate-fade-in rounded-2xl border border-border/70 bg-card p-4 shadow-md"
        >
          {status === "loading" ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : null}
          {status === "error" && !fallback ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">{error || "SIJIL Match could not answer just now."}</p>
              <Button type="button" size="sm" className="rounded-xl" onClick={() => submit(lastQuestion)}>Retry</Button>
            </div>
          ) : null}
          {((status === "success" && data) || fallback) ? (
            <MatchResults
              data={(status === "success" && data) ? data : fallback!}
              fallbackActive={status !== "success" && Boolean(fallback)}
              failureDetail={failureDetail}
              names={names}
              directoryTotals={new Map(candidates.map((candidate) => {
                const stats = getEvidenceStats(candidate);
                return [candidate.id, { credentials: stats.credentials, evidence: stats.evidenceTotal, verifiedEvidence: stats.verified }] as const;
              }))}
              onOpenCandidate={onOpenCandidate}
              onFollowUp={(question) => submit(question)}
              onRetry={() => submit(lastQuestion)}
              onShow={(ids) => onResultIds?.(ids)}
              onReset={() => {
                reset();
                setFallback(null);
                setFailureDetail(null);
                onResultIds?.(null);
              }}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MatchResults({
  data,
  fallbackActive,
  failureDetail,
  names,
  directoryTotals,
  onOpenCandidate,
  onFollowUp,
  onRetry,
  onShow,
  onReset,
}: {
  data: RecruiterMatchAnswer;
  fallbackActive?: boolean;
  failureDetail?: { code: string; status: number | null; upstreamMessage?: string | null } | null;
  names: Map<string, string>;
  directoryTotals?: Map<string, MatchBasis>;
  onOpenCandidate: (id: string) => void;
  onFollowUp: (question: string) => void;
  onRetry: () => void;
  onShow: (ids: string[]) => void;
  onReset: () => void;
}) {
  const bestBySkill = new Map<string, number>();
  for (const row of data.comparison?.rows ?? []) {
    for (const cell of row.cells) {
      bestBySkill.set(cell.skill, Math.max(bestBySkill.get(cell.skill) ?? 0, cell.evidenceCount));
    }
  }

  const matchedPeak = Math.max(0, ...data.candidates.map((candidate) => candidate.matchedVerified));

  return (
    <div className="space-y-4">
      {fallbackActive ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {data.intent === "other" ? null : <p className="text-sm">Live AI matching is unavailable. Showing a basic ranking from shared profiles.</p>}
            {failureDetail ? (
              <details className="group mt-1 text-xs">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 transition group-open:rotate-90" />
                  Details
                </summary>
                <p className="mt-1 font-mono text-[11px]">
                  {failureDetail.code} · HTTP {failureDetail.status ?? "—"} · {failureCopy(failureDetail.code)}
                  {failureDetail.upstreamMessage ? ` · ${failureDetail.upstreamMessage}` : ""}
                </p>
              </details>
            ) : null}
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full shrink-0 rounded-xl border-amber-400/60 bg-transparent sm:w-auto" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry live match
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {data.intent === "other" ? null : <h2 className="text-base font-semibold tracking-tight text-foreground">{data.headline}</h2>}
          {data.caution ? <p className="mt-1 text-sm text-muted-foreground">{data.caution}</p> : null}
          {data.closeNote ? <p className="mt-1 text-sm text-muted-foreground">{data.closeNote}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" className="w-full shrink-0 rounded-xl sm:w-auto" onClick={onReset}>
          <X className="h-3.5 w-3.5" />
          Clear answer
        </Button>
      </div>
      {data.intent === "other" && data.candidates.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
          <p className="text-sm text-foreground">{data.headline}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3 rounded-xl" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry live match
          </Button>
        </div>
      ) : data.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shared candidate matched this question. Try a broader skill or campus.</p>
      ) : (
        <div className="space-y-3">
          <Button type="button" variant="secondary" size="sm" className="w-full rounded-xl sm:w-auto" onClick={() => onShow(data.candidates.filter((candidate) => candidate.matchLevel !== "none").map((candidate) => candidate.id))}>
            <ListFilter className="h-3.5 w-3.5" />
            Show these in the directory
          </Button>
          {data.candidates.filter((candidate) => candidate.matchLevel !== "none").map((candidate) => {
            const best = candidate.rank === 1 && candidate.matchLevel !== "partial" && candidate.matchLevel !== "count" && !data.closeNote;
            const showRank = candidate.matchLevel !== "partial" && candidate.rank;
            const basis = directoryTotals?.get(candidate.id) ?? candidate.basis;
            const bar = matchedBarPercent(candidate.matchedVerified, matchedPeak, basis.evidence);
            const barTitle = `Matched skills: ${candidate.matchedVerified} verified, ${candidate.matchedCorroborating} corroborating. Totals: ${evidenceLine(basis)}`;
            return (
              <article key={candidate.id} className={cn("rounded-2xl border bg-background/60 p-3 sm:p-4", best ? "border-primary/50 shadow-sm" : "border-border/60")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {showRank ? (
                        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", best ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{candidate.rank}</span>
                      ) : null}
                      {names.get(candidate.id) ?? "Shared learner"}
                      {best && candidate.matchLevel !== "partial" ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Best match</span> : null}
                    </p>
                    <p className={cn("mt-1 text-sm", candidate.matchLevel === "count" ? "font-semibold text-foreground" : "text-muted-foreground")}>{candidate.verdict}</p>
                  </div>
                  <Button type="button" size="sm" className="w-full rounded-xl sm:w-auto" onClick={() => onOpenCandidate(candidate.id)}>Review</Button>
                </div>
                {bar !== null ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" title={barTitle}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {candidate.strengths.map((item) => (
                    <span key={item} className="rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-medium text-success">{item}</span>
                  ))}
                  {candidate.gaps.map((item) => (
                    <span key={item} className="rounded-full border border-border bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{item}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Totals: {evidenceLine(basis)}</p>
              </article>
            );
          })}
          {data.candidates.some((candidate) => candidate.matchLevel === "none") ? (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">Not shown ({data.candidates.filter((candidate) => candidate.matchLevel === "none").length})</summary>
              <ul className="mt-2 space-y-1">
                {data.candidates.filter((candidate) => candidate.matchLevel === "none").map((candidate) => (
                  <li key={candidate.id}>{names.get(candidate.id) ?? "Shared learner"}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
      {data.comparison ? (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Candidate</th>
                {data.comparison.skills.map((skill) => (
                  <th key={skill} className="px-3 py-2 text-left">{skill}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.comparison.rows.map((row) => (
                <tr key={row.candidateId} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{names.get(row.candidateId) ?? "Shared learner"}</td>
                  {data.comparison!.skills.map((skill) => {
                    const cell = row.cells.find((item) => item.skill === skill);
                    const best = (bestBySkill.get(skill) ?? 0) > 0 && cell?.evidenceCount === bestBySkill.get(skill);
                    return (
                      <td key={skill} className={cn("px-3 py-2", best && "bg-success-soft/70")}>
                        {cell ? (
                          <span className="inline-flex items-center gap-1">
                            {cell.evidenceCount}
                            {cell.verified ? <Check className="h-3.5 w-3.5 text-success" aria-label="Verified" /> : null}
                          </span>
                        ) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data.notDisclosed.length > 0 ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Not disclosed: {data.notDisclosed.join("; ")}
        </p>
      ) : null}
      {data.followUps.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.followUps.map((followUp) => (
            <button
              key={followUp}
              type="button"
              onClick={() => onFollowUp(followUp)}
              className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {followUp}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">Based only on evidence candidates chose to share. AI assists; you decide.</p>
    </div>
  );
}

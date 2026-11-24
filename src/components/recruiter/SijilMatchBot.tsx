import { useState } from "react";
import { ArrowRight, Search, ChevronRight, ListFilter, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import { buildFallbackMatchAnswer } from "@/lib/recruiter-match-fallback";
import type { RecruiterMatchAnswer } from "@/lib/recruiter-match-response";
import { useRecruiterMatch } from "@/hooks/useRecruiterMatch";
import { cn } from "@/lib/utils";

const FALLBACK_CODES = new Set(["UPSTREAM", "UPSTREAM_HTTP", "UPSTREAM_EMPTY", "UPSTREAM_BLOCKED", "UPSTREAM_TRUNCATED", "BAD_JSON", "NOT_FOUND", "UNKNOWN"]);

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

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const RAW_ID_RE = /\b(?:learner[_-]?id|user[_-]?id|candidate[_-]?id)\s*[:=]?\s*\S+/gi;

/** Strip raw IDs / UUIDs from AI copy so the UI never shows internal identifiers. */
function cleanDisplayText(value: string | null | undefined, fallback = ""): string {
  if (!value) return fallback;
  const cleaned = value
    .replace(UUID_RE, "")
    .replace(RAW_ID_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s([,.;:])/g, "$1")
    .trim();
  return cleaned || fallback;
}

function isRawIdentifier(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (UUID_RE.test(trimmed)) return true;
  UUID_RE.lastIndex = 0;
  if (/^[0-9a-f-]{20,}$/i.test(trimmed)) return true;
  return false;
}

function displayCandidateName(id: string, names: Map<string, string>): string {
  const mapped = names.get(id)?.trim();
  if (mapped && !isRawIdentifier(mapped)) return mapped;
  return "Learner";
}

function personInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
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

  const usableMatches = (answer: RecruiterMatchAnswer | null | undefined) =>
    (answer?.candidates ?? []).filter((candidate) => candidate.matchLevel !== "none");

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
      if (!result || result.stale) return;

      const liveMatches = usableMatches(result.answer);
      if (result.answer && liveMatches.length > 0) {
        onResultIds?.(liveMatches.map((candidate) => candidate.id));
        return;
      }

      // Live AI failed, or returned no usable ranks — always try local ranking so the panel isn't empty.
      if (result.code === "AUTH") return;
      if (result.code === "RATE" && pool.length === 0) return;

      const local = buildFallbackMatchAnswer(text, pool, candidateSkills);
      const localMatches = usableMatches(local);
      if (localMatches.length === 0 && result.answer) {
        // Keep the live "no match" / other message when local also has nothing.
        onResultIds?.(null);
        return;
      }
      if (localMatches.length === 0 && !result.answer) {
        if (result.code && !FALLBACK_CODES.has(result.code) && result.code !== "RATE") return;
      }

      setFailureDetail(
        result.answer
          ? null
          : { code: result.code ?? "UNKNOWN", status: result.status, upstreamMessage: result.upstreamMessage ?? null },
      );
      setFallback(local);
      onResultIds?.(localMatches.map((candidate) => candidate.id));
    });
  };

  const showResults = status === "loading" || status === "error" || status === "success";
  // Prefer local fallback whenever we set it (covers empty/unusable live answers).
  const displayAnswer = fallback ?? (status === "success" ? data : null);
  const fallbackActive = Boolean(fallback) && !(status === "success" && data && usableMatches(data).length > 0);

  return (
    <div className="relative w-full">
      <form
        className="flex min-h-12 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-2.5 py-1.5 shadow-sm transition duration-200 focus-within:border-[#023E8A]/40 focus-within:ring-2 focus-within:ring-[#023E8A]/15"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <span className="flex size-8 shrink-0 items-center justify-center text-sijil-blue">
          <Search className="h-5 w-5" aria-hidden />
        </span>
        <label className="sr-only" htmlFor="sijil-match-question">Ask SIJIL Match</label>
        <input
          id="sijil-match-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Describe the role or skills you are looking for..."
          maxLength={500}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus-visible:outline-none"
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 shrink-0 gap-2 rounded-lg bg-[#023E8A] px-3 text-xs sm:px-5 hover:bg-[#012A5C] focus-visible:ring-2 focus-visible:ring-[#023E8A] focus-visible:ring-offset-2"
          disabled={status === "loading" || !input.trim()}
          aria-label="Find matches"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Find matches <ArrowRight className="size-4" aria-hidden="true" /></>}
        </Button>
      </form>

      {selectedIds.length > 0 ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-foreground shadow-sm">
          Asking about {selectedIds.length} selected
          {onClearSelection ? (
            <button type="button" onClick={onClearSelection} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Clear selected learners">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </p>
      ) : null}

      {showResults ? (
        <section
          aria-live="polite"
          className="mt-4 animate-fade-in overflow-hidden rounded-xl border border-[#e2e8f0] bg-white"
        >
          {status === "loading" ? (
            <div className="space-y-3 p-4" aria-busy="true">
              <div className="h-5 w-2/3 animate-pulse rounded-lg bg-[#e8eef7]" />
              <div className="h-14 animate-pulse rounded-xl bg-[#f1f5f9]" />
              <div className="h-14 animate-pulse rounded-xl bg-[#f1f5f9]" />
            </div>
          ) : null}
          {status === "error" && !displayAnswer ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-[#334155]">{error || "SIJIL Match could not answer just now."}</p>
              <Button type="button" size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => submit(lastQuestion)}>Retry</Button>
            </div>
          ) : null}
          {displayAnswer ? (
            <MatchResults
              data={displayAnswer}
              fallbackActive={fallbackActive}
              failureDetail={failureDetail}
              names={names}
              onOpenCandidate={onOpenCandidate}
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
  onOpenCandidate,
  onRetry,
  onShow,
  onReset,
}: {
  data: RecruiterMatchAnswer;
  fallbackActive?: boolean;
  failureDetail?: { code: string; status: number | null; upstreamMessage?: string | null } | null;
  names: Map<string, string>;
  onOpenCandidate: (id: string) => void;
  onRetry: () => void;
  onShow: (ids: string[]) => void;
  onReset: () => void;
}) {
  const matched = data.candidates.filter((candidate) => candidate.matchLevel !== "none");
  const headline = cleanDisplayText(data.headline);
  const caution = cleanDisplayText(data.caution);
  const closeNote = cleanDisplayText(data.closeNote);

  return (
    <div>
      {fallbackActive ? (
        <div className="flex flex-col gap-2 border-b border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[#92400e] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {data.intent === "other" ? null : (
              <p className="text-sm">Live AI matching is unavailable. Showing a basic ranking from shared profiles.</p>
            )}
            {failureDetail ? (
              <details className="group mt-1 text-xs">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A] [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 transition group-open:rotate-90" />
                  Details
                </summary>
                <p className="mt-1 text-[11px] text-[#92400e]">
                  {failureCopy(failureDetail.code)}
                </p>
              </details>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full shrink-0 rounded-xl border-[#fde68a] bg-white sm:w-auto"
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry live match
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-[#e2e8f0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {data.intent === "other" || !headline ? null : (
            <h2 className="text-sm font-semibold text-[#023E8A]">{headline}</h2>
          )}
          {caution ? <p className="mt-1 text-xs text-[#64748b]">{caution}</p> : null}
          {closeNote ? <p className="mt-1 text-xs text-[#64748b]">{closeNote}</p> : null}
          {matched.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-[#64748b]">
              {matched.length} {matched.length === 1 ? "learner" : "learners"} matched
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" className="rounded-xl text-[#64748b]" onClick={onReset}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {data.intent === "other" && matched.length === 0 ? (
        <div className="space-y-3 p-4">
          <p className="text-sm text-[#334155]">{headline || "SIJIL Match could not rank learners for that question."}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-xl border-[#e2e8f0]" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry live match
          </Button>
        </div>
      ) : matched.length === 0 ? (
        <p className="p-4 text-sm text-[#64748b]">No shared learner matched this question. Try a broader skill.</p>
      ) : (
        <ul className="divide-y divide-[#f1f5f9]">
          {matched.map((candidate) => {
            const best =
              candidate.rank === 1
              && candidate.matchLevel !== "partial"
              && candidate.matchLevel !== "count"
              && !data.closeNote;
            const showRank = candidate.matchLevel !== "partial" && Boolean(candidate.rank);
            const name = displayCandidateName(candidate.id, names);
            const verdict = cleanDisplayText(candidate.verdict);
            const strengths = candidate.strengths
              .map((item) => cleanDisplayText(item))
              .filter(Boolean)
              .slice(0, 3);
            const gaps = candidate.gaps
              .map((item) => cleanDisplayText(item))
              .filter(Boolean)
              .slice(0, 2);

            return (
              <li
                key={candidate.id}
                className="flex flex-col gap-3 bg-white px-4 py-4 transition-colors hover:bg-[#f8fafc] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      best ? "bg-[#023E8A] text-white" : "bg-[#e8eef7] text-[#023E8A]",
                    )}
                  >
                    {showRank ? candidate.rank : personInitials(name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#023E8A]">
                      <span className="truncate">{name}</span>
                      {best ? (
                        <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold text-[#059669]">
                          Best match
                        </span>
                      ) : null}
                    </p>
                    {verdict ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#64748b]">{verdict}</p>
                    ) : null}
                    {(strengths.length > 0 || gaps.length > 0) ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {strengths.map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#059669]"
                          >
                            {item}
                          </span>
                        ))}
                        {gaps.map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-medium text-[#64748b]"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="w-full shrink-0 rounded-xl bg-[#023E8A] hover:bg-[#012A5C] sm:w-auto"
                  onClick={() => onOpenCandidate(candidate.id)}
                >
                  Review
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {matched.length > 0 ? (
        <div className="border-t border-[#e2e8f0] px-4 py-3">
          <button
            type="button"
            onClick={() => onShow(matched.map((candidate) => candidate.id))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#023E8A] hover:underline"
          >
            <ListFilter className="h-3.5 w-3.5" />
            Open matched learners in Directory
          </button>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, ShieldCheck, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import {
  knownSkillsFromDirectory,
  resolveInterpretedAsk,
  resolveRecruiterAsk,
  type LearnerCompare,
  type RankedMatch,
} from "@/lib/recruiter-match";
import { interpretRecruiterQuestion } from "@/lib/recruiter-match-ai";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "bot" | "recruiter";
  text: string;
  matches?: RankedMatch[];
  compare?: LearnerCompare;
};

export function SijilMatchBot({
  candidates,
  candidateSkills,
  onOpenCandidate,
  onCompare,
}: {
  candidates: CandidateView[];
  candidateSkills: Record<string, CandidateSkill[]>;
  onOpenCandidate: (id: string) => void;
  onCompare?: (leftId: string, rightId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "bot",
    text: "Ask for a skill and the proof you need, or name two learners to compare.",
  }]);
  const scroller = useRef<HTMLDivElement>(null);
  const knownSkills = useMemo(
    () => knownSkillsFromDirectory(candidates, candidateSkills),
    [candidates, candidateSkills],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const pushAnswer = (resolved: { text: string; matches?: RankedMatch[]; compare?: LearnerCompare }) => {
    setMessages((current) => [
      ...current,
      {
        id: `b-${Date.now()}`,
        role: "bot",
        text: resolved.text,
        compare: resolved.compare,
        matches: resolved.compare ? undefined : resolved.matches,
      },
    ]);
  };

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    const previousQuestion = [...messages].reverse().find((message) => message.role === "recruiter")?.text ?? "";
    const question = /^(yes|yeah|yep|ok|okay|sure|show|show them|list|list them|please)\.?$/i.test(text) && previousQuestion
      ? previousQuestion
      : text;
    setInput("");
    setNotice("");
    setPanelOpen(true);
    const history = messages
      .filter((message) => message.id !== "welcome")
      .slice(-6)
      .map((message) => ({ role: message.role, text: message.text }));
    setMessages((current) => [
      ...current,
      { id: `r-${Date.now()}`, role: "recruiter", text },
    ]);
    setThinking(true);
    void interpretRecruiterQuestion({
      question,
      knownSkills,
      learnerNames: candidates.map((candidate) => candidate.name).filter(Boolean),
      institutions: [...new Set(candidates.map((candidate) => candidate.institution).filter((name) => name && name !== "—"))],
      history,
    })
      .then((interpreted) => {
        setNotice("");
        pushAnswer(resolveInterpretedAsk(interpreted, candidates, candidateSkills, knownSkills, question));
      })
      .catch(() => {
        setNotice("Gemini is unavailable, so this answer used the on-device matcher.");
        pushAnswer(resolveRecruiterAsk(question, candidates, candidateSkills, knownSkills));
      })
      .finally(() => setThinking(false));
  };

  const answers = messages.filter((message) => message.id !== "welcome");

  return (
    <div className="relative w-full">
      <form
        className="flex h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 shadow-md transition duration-200 focus-within:border-primary/40 focus-within:shadow-[var(--shadow-glow)]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-sidebar-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </span>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => {
            if (answers.length > 0) setPanelOpen(true);
          }}
          placeholder="Ask SIJIL Match…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <Button
          type="submit"
          size="sm"
          className="h-10 w-10 shrink-0 rounded-full p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={thinking}
          aria-label="Ask SIJIL Match"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {panelOpen && answers.length > 0 ? (
        <div className="absolute left-0 z-30 mt-2 flex max-h-80 w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg sm:max-w-xl">
          <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">SIJIL Match</p>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {answers.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "recruiter" && "justify-end")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-xl px-2.5 py-2 text-xs leading-relaxed",
                  message.role === "bot"
                    ? "bg-muted/50 text-foreground ring-1 ring-border/70"
                    : "bg-primary text-primary-foreground",
                )}
              >
                <p>{message.text}</p>
                {message.compare ? (
                  <div className="mt-3 space-y-2">
                    {[message.compare.left, message.compare.right].map((person, index) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => onOpenCandidate(person.id)}
                        className="w-full rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left transition hover:border-primary/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <CandidateAvatar
                            name={person.name}
                            avatarUrl={person.avatarUrl}
                            className="h-8 w-8"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{person.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{person.institution}</p>
                          </div>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {(index === 0 ? message.compare!.leftLines : message.compare!.rightLines).map((line) => (
                            <li key={line} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
                              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                              {line}
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                    {onCompare ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full rounded-xl"
                        onClick={() => onCompare(message.compare!.left.id, message.compare!.right.id)}
                      >
                        <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                        Open full compare
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {message.matches?.length ? (
                  <ul className="mt-3 space-y-2">
                    {message.matches.map((match) => (
                      <li key={match.candidate.id}>
                        <button
                          type="button"
                          onClick={() => onOpenCandidate(match.candidate.id)}
                          className="w-full rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left transition hover:border-primary/40"
                        >
                          <div className="flex items-center gap-2.5">
                            <CandidateAvatar
                              name={match.candidate.name}
                              avatarUrl={match.candidate.avatarUrl}
                              className="h-8 w-8"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{match.candidate.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {match.matchedSkill || match.candidate.topSkill} · {match.candidate.institution}
                              </p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              {match.score}%
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {match.reasons.map((reason) => (
                              <li key={reason} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                <span className="text-foreground/80">{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
          {thinking ? (
            <p className="px-1 text-xs text-muted-foreground">Asking Gemini…</p>
          ) : null}
          </div>
          {notice ? (
            <p className="border-t border-border/70 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">{notice}</p>
          ) : (
            <p className="border-t border-border/70 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
              Shared evidence only.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

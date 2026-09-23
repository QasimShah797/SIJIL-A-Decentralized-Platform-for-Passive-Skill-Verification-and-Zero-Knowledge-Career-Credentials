import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, ShieldCheck, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import {
  composeMatchReply,
  isCompareAsk,
  knownSkillsFromDirectory,
  parseRequirement,
  rankCandidatesForRequirement,
  resolveCompareAsk,
  type LearnerCompare,
  type RankedMatch,
} from "@/lib/recruiter-match";
import { cn } from "@/lib/utils";

const PROMPTS = [
  "TypeScript with GitHub project",
  "Dart with GitHub project",
  "Compare learners with Java projects",
];

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
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "bot",
    text: "Ask for a competency and the proof you need, or compare two learners by name. I only use evidence they already shared.",
  }]);
  const scroller = useRef<HTMLDivElement>(null);
  const knownSkills = useMemo(
    () => knownSkillsFromDirectory(candidates, candidateSkills),
    [candidates, candidateSkills],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `r-${Date.now()}`, role: "recruiter", text },
    ]);
    setThinking(true);
    window.setTimeout(() => {
      if (isCompareAsk(text)) {
        const resolved = resolveCompareAsk(text, candidates, candidateSkills, knownSkills);
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
        setThinking(false);
        return;
      }

      const requirement = parseRequirement(text, knownSkills);
      const matches = rankCandidatesForRequirement(requirement, candidates, candidateSkills);
      setMessages((current) => [
        ...current,
        {
          id: `b-${Date.now()}`,
          role: "bot",
          text: composeMatchReply(requirement, matches),
          matches,
        },
      ]);
      setThinking(false);
    }, 650);
  };

  return (
    <aside className="flex h-full min-h-[540px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="border-b border-primary/20 bg-primary px-5 py-4 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">SIJIL Match</p>
            <h2 className="text-base font-semibold leading-tight">Evidence shortlist</h2>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pt-4">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "recruiter" && "justify-end")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
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
            <p className="text-xs text-muted-foreground">Checking shared evidence…</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => ask(prompt)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Compare Qasim with Aaiza…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm" className="rounded-lg" disabled={thinking}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Matches and compares stay limited to disclosed evidence. Hidden fields are never read.
        </p>
      </div>
    </aside>
  );
}

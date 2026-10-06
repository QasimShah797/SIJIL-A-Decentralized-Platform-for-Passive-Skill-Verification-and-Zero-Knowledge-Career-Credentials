import { ArrowRight, ShieldCheck, Wallet } from "lucide-react";

import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import type { CandidateView } from "@/lib/db/candidates";
import { cn } from "@/lib/utils";

export type RecruiterCandidateCardCandidate = CandidateView;

type RecruiterCandidateCardProps = {
  candidate: RecruiterCandidateCardCandidate;
  selected?: boolean;
  onSelectedChange?: () => void;
  onOpenSummary: () => void;
  className?: string;
};

const chipTones = [
  "border-info/20 bg-info-soft text-info",
  "border-success/20 bg-success-soft text-success",
  "border-violet/20 bg-violet-soft text-violet",
  "border-warning/30 bg-warning-soft text-warning",
  "border-primary/15 bg-secondary text-secondary-foreground",
];

function skillChips(candidate: CandidateView): { visible: string[]; extra: number } {
  const names = [
    ...(candidate.searchableSkills ?? []),
    candidate.topSkill,
  ].filter((name): name is string => Boolean(name && name !== "—"));
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key) || name.length > 22) continue;
    seen.add(key);
    chips.push(name);
  }
  return { visible: chips.slice(0, 4), extra: Math.max(0, chips.length - 4) };
}

export function RecruiterCandidateCard({
  candidate,
  selected = false,
  onSelectedChange,
  onOpenSummary,
  className,
}: RecruiterCandidateCardProps) {
  const { visible, extra } = skillChips(candidate);
  const careerGoal = candidate.careerGoal?.trim();

  return (
    <article
      className={cn(
        "group flex h-full w-full flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        selected && "border-primary bg-primary/5 shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onSelectedChange && (
            <Checkbox
              checked={selected}
              onCheckedChange={onSelectedChange}
              aria-label="Select to compare"
              className="h-5 w-5 rounded-md border-primary"
            />
          )}
          <CandidateAvatar
            name={candidate.name}
            avatarUrl={candidate.avatarUrl}
            className="h-14 w-14 ring-2 ring-primary/15"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground" title={candidate.name}>{candidate.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{candidate.institution}</p>
          </div>
        </div>
        {candidate.attestation === "Approved" ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
            <ShieldCheck className="h-3 w-3" />
            {candidate.attestation}
          </span>
        ) : (
          <StatusBadge
            variant="warning"
            icon={<ShieldCheck className="h-3 w-3" />}
          >
            {candidate.attestation}
          </StatusBadge>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {visible.map((chip, index) => (
            <span
              key={chip}
              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", chipTones[index % chipTones.length])}
            >
              {chip}
            </span>
          ))}
          {extra > 0 ? (
            <span className="rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              +{extra}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className={cn("mt-4 line-clamp-2 text-sm leading-relaxed", careerGoal ? "text-foreground/80" : "text-muted-foreground")}>
        {careerGoal || "No career goal shared yet."}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-4 mt-5">
        <dl className="flex gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />
            <dt className="sr-only">Credentials</dt>
            <dd><span className="font-semibold text-foreground">{candidate.credentialCount}</span> credentials</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
            <dt className="sr-only">Evidence</dt>
            <dd><span className="font-semibold text-foreground">{candidate.evidence}</span> evidence</dd>
          </div>
        </dl>
        <Button size="sm" className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={onOpenSummary}>
          Review <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Button>
      </div>
    </article>
  );
}

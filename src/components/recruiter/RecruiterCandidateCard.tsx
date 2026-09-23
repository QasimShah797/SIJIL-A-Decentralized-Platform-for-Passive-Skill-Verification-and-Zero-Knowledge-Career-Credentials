import { ArrowRight, ShieldCheck } from "lucide-react";

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

function skillChips(candidate: CandidateView): string[] {
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
    if (chips.length >= 4) break;
  }
  return chips;
}

export function RecruiterCandidateCard({
  candidate,
  selected = false,
  onSelectedChange,
  onOpenSummary,
  className,
}: RecruiterCandidateCardProps) {
  const chips = skillChips(candidate);
  const careerGoal = candidate.careerGoal?.trim();

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md",
        selected && "border-primary ring-2 ring-primary/20",
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
            />
          )}
          <CandidateAvatar
            name={candidate.name}
            avatarUrl={candidate.avatarUrl}
            className="h-12 w-12"
          />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{candidate.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{candidate.institution}</p>
          </div>
        </div>
        <StatusBadge
          variant={candidate.attestation === "Approved" ? "verified" : "warning"}
          icon={<ShieldCheck className="h-3 w-3" />}
        >
          {candidate.attestation}
        </StatusBadge>
      </div>

      {chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-4 line-clamp-2 text-sm leading-relaxed", careerGoal ? "text-foreground/80" : "text-muted-foreground")}>
        {careerGoal || "No career goal shared yet."}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <dl className="flex gap-4 text-xs text-muted-foreground">
          <div>
            <dt className="sr-only">Credentials</dt>
            <dd><span className="font-semibold text-foreground">{candidate.credentialCount}</span> credentials</dd>
          </div>
          <div>
            <dt className="sr-only">Evidence</dt>
            <dd><span className="font-semibold text-foreground">{candidate.evidence}</span> evidence</dd>
          </div>
        </dl>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={onOpenSummary}>
          Review <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}

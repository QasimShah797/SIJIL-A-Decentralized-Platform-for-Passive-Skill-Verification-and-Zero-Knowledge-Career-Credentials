import { ArrowRight, ShieldCheck } from "lucide-react";

import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CandidateAvatar } from "@/components/recruiter/CandidateAvatar";
import type { CandidateView } from "@/lib/db/candidates";

export type RecruiterCandidateCardCandidate = CandidateView;

type RecruiterCandidateCardProps = {
  candidate: RecruiterCandidateCardCandidate;
  selected?: boolean;
  onSelectedChange?: () => void;
  onOpenSummary: () => void;
  className?: string;
};

function CareerField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{value}</div>
    </div>
  );
}

export function RecruiterCandidateCard({
  candidate,
  selected = false,
  onSelectedChange,
  onOpenSummary,
  className,
}: RecruiterCandidateCardProps) {
  const skillsSummary = candidate.skillsSummary?.trim();
  const careerGoal = candidate.careerGoal?.trim();
  const hasCareerInfo = Boolean(skillsSummary || careerGoal);

  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onSelectedChange && (
              <Checkbox
                checked={selected}
                onCheckedChange={onSelectedChange}
                aria-label="Select to compare"
              />
            )}
            <CandidateAvatar name={candidate.name} avatarUrl={candidate.avatarUrl} />
            <div className="min-w-0">
              <div className="truncate font-medium">{candidate.name}</div>
              <div className="truncate text-xs text-muted-foreground">{candidate.institution}</div>
            </div>
          </div>
          <StatusBadge
            variant={candidate.attestation === "Approved" ? "verified" : "warning"}
            icon={<ShieldCheck className="h-3 w-3" />}
          >
            {candidate.attestation}
          </StatusBadge>
        </div>

        {hasCareerInfo ? (
          <div className="mt-4 space-y-3">
            {skillsSummary && (
              <CareerField
                label="Academic interests / skills summary"
                value={skillsSummary}
              />
            )}
            {careerGoal && (
              <CareerField label="Career goal" value={careerGoal} />
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            No career information available yet.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {candidate.credentialCount} verifiable credentials
          </div>
          <Button size="sm" onClick={onOpenSummary}>
            Open summary <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

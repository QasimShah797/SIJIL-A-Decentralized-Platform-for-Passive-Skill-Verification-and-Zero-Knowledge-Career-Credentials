import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CompetencyPackageCard,
  EvidenceInspectorCard,
  type InspectorSource,
} from "@/components/wallet/WalletWorkspacePanels";
import {
  buildEvidenceLedger,
  inspectorViewFromLedger,
} from "@/lib/public-credential";
import type { SharedCredentialView } from "@/lib/shared-presentation";

export type RecruiterSkillCard = {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
  expiresAt: string | null;
  competencyId: string;
  selectedFields: string[];
  payload: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function recruiterSkillCards(credentials: SharedCredentialView[]): RecruiterSkillCard[] {
  const seen = new Set<string>();
  const cards: RecruiterSkillCard[] = [];

  for (const credential of credentials) {
    const payload = credential.disclosedPayload ?? {};
    const competency = asRecord(payload.competency) ?? {};
    const skillRows = Array.isArray(payload.skills)
      ? payload.skills.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      : [];
    const rows = skillRows.length > 0
      ? skillRows
      : [{
          competencyId: competency.competencyId ?? credential.presentationId,
          name: credential.skill ?? credential.title,
          domain: competency.domain ?? credential.subtitle,
        }];

    for (const row of rows) {
      const name = asText(row.name) || credential.skill || credential.title;
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      cards.push({
        id: `${credential.presentationId}:${asText(row.competencyId) || name}`,
        name,
        domain: asText(row.domain) || credential.subtitle,
        createdAt: credential.createdAt,
        expiresAt: credential.expiresAt,
        competencyId: asText(row.competencyId) || asText(competency.competencyId) || name,
        selectedFields: credential.selectedFields,
        payload,
      });
    }
  }

  return cards;
}

export function RecruiterSkillEvidenceItem({ card }: { card: RecruiterSkillCard }) {
  const [source, setSource] = useState<InspectorSource>("github");
  const inspector = useMemo(() => {
    const ledger = buildEvidenceLedger(card.payload, card.competencyId, card.selectedFields);
    return inspectorViewFromLedger(ledger);
  }, [card.payload, card.competencyId, card.selectedFields]);

  useEffect(() => {
    if (!inspector.availableSources.includes(source)) {
      setSource(inspector.availableSources[0] ?? "github");
    }
  }, [inspector.availableSources, source]);

  const meta = [
    card.domain,
    formatShortDate(card.createdAt) ? `Issued ${formatShortDate(card.createdAt)}` : null,
    formatShortDate(card.expiresAt) ? `Valid through ${formatShortDate(card.expiresAt)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <AccordionItem value={card.id} className="border-border/60">
      <AccordionTrigger className="group py-4 hover:no-underline [&>svg:last-child]:hidden">
        <div className="flex w-full min-w-0 items-start gap-3 text-left">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-semibold leading-snug text-foreground">{card.name}</p>
            {meta ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{meta}</p>
            ) : null}
          </div>
          <ChevronDown
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4 pt-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
          <CompetencyPackageCard
            competencyName={card.name}
            github={inspector.github}
            lmsRows={inspector.lmsRows}
            taskLabel={inspector.taskDetail}
          />
          <EvidenceInspectorCard
            source={source}
            onSourceChange={setSource}
            availableSources={inspector.availableSources}
            githubRepos={inspector.githubRepos}
            lmsAssignments={inspector.lmsAssignments}
            taskDetail={inspector.taskDetail}
            reviews={inspector.reviews}
            verifyUrl={inspector.verifyUrl}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

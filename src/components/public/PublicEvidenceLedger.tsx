import type { EvidenceLedgerItem } from "@/lib/public-credential";
import { TrustTierBadge } from "@/components/public/TrustTierBadge";

const SOURCE_LABEL: Record<EvidenceLedgerItem["source"], string> = {
  lms: "LMS",
  github: "GitHub",
  practical_task: "Practical task",
  peer_review: "Peer review",
  teacher_feedback: "Teacher feedback",
};

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function PublicEvidenceLedger({
  items,
  emptyLabel = "No disclosed evidence is available for this competency.",
}: {
  items: EvidenceLedgerItem[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            <TrustTierBadge trustTier={item.trustTier} trustTierLabel={item.trustTierLabel} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {SOURCE_LABEL[item.source]}
            {item.status ? ` · ${item.status}` : ""}
            {formatWhen(item.timestamp) ? ` · ${formatWhen(item.timestamp)}` : ""}
          </p>
          {item.detail ? <p className="mt-2 text-sm text-foreground/90">{item.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

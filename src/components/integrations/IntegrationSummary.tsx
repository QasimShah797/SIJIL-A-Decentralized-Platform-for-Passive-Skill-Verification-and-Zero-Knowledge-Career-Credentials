import { cn } from "@/lib/utils";

export type IntegrationSummaryProps = {
  connectedSources: number;
  githubEvidence: number;
  lmsRecords: number;
  certificates: number;
  lastPortfolioSync: string | null;
  className?: string;
};

const stats = [
  { key: "connectedSources", label: "Connected sources" },
  { key: "githubEvidence", label: "GitHub evidence" },
  { key: "lmsRecords", label: "LMS records" },
  { key: "certificates", label: "Certificates" },
] as const;

export function IntegrationSummary({
  connectedSources,
  githubEvidence,
  lmsRecords,
  certificates,
  lastPortfolioSync,
  className,
}: IntegrationSummaryProps) {
  const values: Record<(typeof stats)[number]["key"], number> = {
    connectedSources,
    githubEvidence,
    lmsRecords,
    certificates,
  };

  return (
    <div className={cn("rounded-xl border bg-card px-4 py-4 sm:px-5", className)}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {stats.map(({ key, label }) => (
          <div key={key} className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{values[key]}</p>
          </div>
        ))}
        <div className="col-span-2 min-w-0 sm:col-span-4 lg:col-span-1">
          <p className="text-xs text-muted-foreground">Last portfolio sync</p>
          <p className="mt-0.5 text-sm font-medium text-foreground truncate">
            {lastPortfolioSync ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

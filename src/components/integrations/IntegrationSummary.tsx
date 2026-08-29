import { cn } from "@/lib/utils";

export type IntegrationSummaryProps = {
  connectedSources: number;
  githubEvidence: number;
  lmsRecords: number;
  certificates: number;
  lastPortfolioSync: string | null;
  className?: string;
  variant?: "default" | "embedded";
};

function MiniSparkline({ tint = 0 }: { tint?: number }) {
  const colors = ["#2dd4bf", "#34d399", "#22d3ee", "#fbbf24"];
  const curves = [
    "M0 22 C10 22 18 16 28 18 S48 20 58 14 S78 10 88 12 S108 8 120 10",
    "M0 20 C12 20 20 24 32 18 S52 14 62 16 S82 12 92 10 S110 14 120 11",
    "M0 24 C14 22 22 18 34 20 S54 16 66 18 S86 12 98 14 S112 10 120 12",
    "M0 18 C11 16 22 22 36 16 S56 12 68 16 S88 10 100 14 S114 10 120 13",
  ];
  const stroke = colors[tint % colors.length];
  const curve = curves[tint % curves.length];
  const area = `${curve} L120 32 L0 32 Z`;

  return (
    <svg viewBox="0 0 120 32" className="mt-2 h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={`${stroke}33`} />
      <path d={curve} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type StatItem = {
  label: string;
  value: string | number;
  sub: string;
  showSparkline?: boolean;
  tint?: number;
  healthy?: boolean;
};

export function IntegrationSummary({
  connectedSources,
  githubEvidence,
  lmsRecords,
  certificates,
  lastPortfolioSync,
  className,
  variant = "default",
}: IntegrationSummaryProps) {
  const embedded = variant === "embedded";
  const stats: StatItem[] = [
    {
      label: "Connected sources",
      value: connectedSources,
      sub: "Active of 7 available",
      tint: 0,
    },
    {
      label: "GitHub evidence",
      value: githubEvidence,
      sub: "repositories imported",
      showSparkline: true,
      tint: 1,
    },
    {
      label: "LMS records",
      value: lmsRecords,
      sub: "synced from course catalog",
      tint: 2,
    },
    {
      label: "Last portfolio sync",
      value: lastPortfolioSync ?? "—",
      sub: lastPortfolioSync ? "Data sync every 24h" : "No sync recorded yet",
      healthy: Boolean(lastPortfolioSync),
      tint: 3,
    },
  ];

  return (
    <div
      className={cn(
        "grid gap-3",
        embedded ? "grid-cols-2" : "gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {stats.map(({ label, value, sub, showSparkline, tint = 0, healthy }) => (
        <div key={label} className={cn("learner-stat-card flex h-full flex-col", embedded ? "p-4" : "p-5")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">{label}</p>
          <p
            className={cn(
              "mt-1.5 font-bold text-[#023E8A]",
              typeof value === "number"
                ? embedded
                  ? "text-2xl tabular-nums"
                  : "text-3xl tabular-nums"
                : "text-xs leading-snug",
            )}
          >
            {value}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {healthy ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#059669]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" aria-hidden />
                Healthy
              </span>
            ) : null}
            <p className="text-[11px] leading-snug text-[#64748b]">{sub}</p>
          </div>
          {showSparkline ? <MiniSparkline tint={tint} /> : null}
          {!showSparkline && !embedded && label !== "Last portfolio sync" ? (
            <div className="mt-3 h-8" aria-hidden />
          ) : null}
        </div>
      ))}
      <span className="sr-only">Certificates uploaded: {certificates}</span>
    </div>
  );
}

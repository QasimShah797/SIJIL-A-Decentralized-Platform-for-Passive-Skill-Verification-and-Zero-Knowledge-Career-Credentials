import { Building2, ShieldCheck, Users, Wallet } from "lucide-react";
import type { CandidateView } from "@/lib/db/candidates";
import { cn } from "@/lib/utils";

const SPARKLINE_SERIES = [
  {
    stroke: "#2dd4bf",
    fill: "rgba(45, 212, 191, 0.2)",
    curve: "M0 29 C10 29 18 22 28 24 S48 28 58 20 S78 12 88 15 S108 9 120 11",
  },
  {
    stroke: "#34d399",
    fill: "rgba(52, 211, 153, 0.18)",
    curve: "M0 27 C12 27 20 31 32 25 S52 19 62 23 S82 17 92 14 S110 18 120 13",
  },
  {
    stroke: "#22d3ee",
    fill: "rgba(34, 211, 238, 0.18)",
    curve: "M0 31 C14 29 22 23 34 25 S54 19 66 21 S86 13 98 16 S112 10 120 12",
  },
  {
    stroke: "#fbbf24",
    fill: "rgba(251, 191, 36, 0.16)",
    curve: "M0 25 C11 23 22 29 36 23 S56 17 68 21 S88 15 100 19 S114 14 120 17",
  },
];

const iconTints = [
  "bg-[#e8eef7] text-[#023E8A]",
  "bg-[#ecfdf5] text-[#059669]",
  "bg-[#ecfeff] text-[#0891b2]",
  "bg-[#fef9c3] text-[#ca8a04]",
];

function SparklineArea({ tint = 0 }: { tint?: number }) {
  const series = SPARKLINE_SERIES[tint % SPARKLINE_SERIES.length];
  const areaPath = `${series.curve} L120 40 L0 40 Z`;

  return (
    <svg viewBox="0 0 120 40" className="mt-3 h-11 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <path d={areaPath} fill={series.fill} />
      <path d={series.curve} fill="none" stroke={series.stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Users;
  tint: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "learner-stat-card p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]",
        active && "ring-2 ring-[#023E8A]",
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconTints[tint % iconTints.length])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-2xl font-bold text-[#023E8A]">{value}</p>
      <p className="text-sm font-medium text-[#334155]">{label}</p>
      <p className="mt-0.5 text-xs text-[#64748b]">{hint}</p>
      <SparklineArea tint={tint} />
    </button>
  );
}

export type RecruiterStatFilter = "all" | "verified" | "credentials" | "institutions";

export function RecruiterDashboardStats({
  candidates,
  active,
  onSelect,
}: {
  candidates: CandidateView[];
  active: RecruiterStatFilter;
  onSelect: (filter: RecruiterStatFilter) => void;
}) {
  const verified = candidates.filter((candidate) => candidate.attestation === "Approved").length;
  const credentials = candidates.reduce((total, candidate) => total + (candidate.credentialCount ?? 0), 0);
  const institutions = new Set(
    candidates.map((candidate) => candidate.institution.trim()).filter((name) => name && name !== "—"),
  ).size;

  const items: {
    id: RecruiterStatFilter;
    label: string;
    value: number;
    hint: string;
    icon: typeof Users;
    tint: number;
  }[] = [
    { id: "all", label: "Directory", value: candidates.length, hint: "Learners with shared profiles", icon: Users, tint: 0 },
    { id: "verified", label: "Verified", value: verified, hint: "Institution attestation approved", icon: ShieldCheck, tint: 1 },
    { id: "credentials", label: "Credentials", value: credentials, hint: "Active shared competency packs", icon: Wallet, tint: 2 },
    { id: "institutions", label: "Institutions", value: institutions, hint: "Distinct campuses in view", icon: Building2, tint: 3 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard
          key={item.id}
          icon={item.icon}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tint={item.tint}
          active={active === item.id}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}

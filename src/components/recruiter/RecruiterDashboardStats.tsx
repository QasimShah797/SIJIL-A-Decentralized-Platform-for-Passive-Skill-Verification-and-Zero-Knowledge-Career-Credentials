import { ShieldCheck, Users, Wallet } from "lucide-react";
import type { CandidateView } from "@/lib/db/candidates";
import { cn } from "@/lib/utils";

const iconTints = [
  "bg-[#e8eef7] text-[#023E8A]",
  "bg-[#ecfdf5] text-[#059669]",
  "bg-[#ecfeff] text-[#0891b2]",
  "bg-[#fef9c3] text-[#ca8a04]",
];

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
    </button>
  );
}

export type RecruiterStatFilter = "all" | "verified" | "credentials";

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

  const items: {
    id: RecruiterStatFilter;
    label: string;
    value: number;
    hint: string;
    icon: typeof Users;
    tint: number;
  }[] = [
    { id: "all", label: "Directory", value: candidates.length, hint: "Learners with shared profiles", icon: Users, tint: 0 },
    { id: "verified", label: "Confirmed Skills", value: verified, hint: "Learners with approved credentials", icon: ShieldCheck, tint: 1 },
    { id: "credentials", label: "Credentials", value: credentials, hint: "Active shared competency packs", icon: Wallet, tint: 2 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

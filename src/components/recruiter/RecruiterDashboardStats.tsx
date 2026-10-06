import { Building2, ShieldCheck, Users, Wallet } from "lucide-react";
import type { CandidateView } from "@/lib/db/candidates";
import { cn } from "@/lib/utils";

const tones = {
  blue: "bg-info-soft text-info",
  emerald: "bg-success-soft text-success",
  violet: "bg-violet-soft text-violet",
  amber: "bg-warning-soft text-warning",
} as const;

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  emphasized = false,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Users;
  tone: keyof typeof tones;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        emphasized
          ? "border-transparent bg-[image:var(--gradient-primary)] text-sidebar-foreground shadow-md"
          : "border-border/60 bg-card text-card-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.16em]",
            emphasized ? "text-sidebar-foreground/80" : "text-muted-foreground",
          )}>
            {label}
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
          <p className={cn("mt-2 text-xs", emphasized ? "text-sidebar-foreground/75" : "text-muted-foreground")}>{hint}</p>
        </div>
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          emphasized ? "bg-white/15 text-sidebar-foreground" : tones[tone],
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function RecruiterDashboardStats({ candidates }: { candidates: CandidateView[] }) {
  const verified = candidates.filter((candidate) => candidate.attestation === "Approved").length;
  const credentials = candidates.reduce((total, candidate) => total + (candidate.credentialCount ?? 0), 0);
  const institutions = new Set(
    candidates.map((candidate) => candidate.institution.trim()).filter((name) => name && name !== "—"),
  ).size;

  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Users}
        label="Directory"
        value={candidates.length}
        hint="Learners with shared profiles"
        tone="blue"
        emphasized
      />
      <StatCard
        icon={ShieldCheck}
        label="Verified"
        value={verified}
        hint="Institution attestation approved"
        tone="emerald"
      />
      <StatCard
        icon={Wallet}
        label="Credentials"
        value={credentials}
        hint="Active shared competency packs"
        tone="violet"
      />
      <StatCard
        icon={Building2}
        label="Institutions"
        value={institutions}
        hint="Distinct campuses in view"
        tone="amber"
      />
    </div>
  );
}

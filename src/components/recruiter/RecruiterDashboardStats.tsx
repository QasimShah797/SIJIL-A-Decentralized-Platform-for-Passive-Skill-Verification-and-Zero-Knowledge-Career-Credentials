import { Building2, ShieldCheck, Users, Wallet } from "lucide-react";
import type { CandidateView } from "@/lib/db/candidates";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Users}
        label="Directory"
        value={candidates.length}
        hint="Learners with shared profiles"
      />
      <StatCard
        icon={ShieldCheck}
        label="Verified"
        value={verified}
        hint="Institution attestation approved"
      />
      <StatCard
        icon={Wallet}
        label="Credentials"
        value={credentials}
        hint="Active shared competency packs"
      />
      <StatCard
        icon={Building2}
        label="Institutions"
        value={institutions}
        hint="Distinct campuses in view"
      />
    </div>
  );
}

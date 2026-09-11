import { Link } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  BookOpen,
  Copy,
  FileText,
  Github,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Star,
  UserCircle,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DeclaredSkill } from "@/lib/sijil-data";
import type { LearnerProfileView } from "@/lib/db/learner-profile";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { VerifyShieldIllustration } from "@/components/learner/PromoIllustrations";

export function skillBucket(status: string): "verified" | "progress" | "idle" {
  const s = status.toLowerCase();
  if (s.includes("credential") || s.includes("wallet")) return "verified";
  if (s.includes("claimed") && !s.includes("evidence")) return "idle";
  return "progress";
}

export function profileCompletion(fields: (string | null | undefined)[]) {
  const filled = fields.filter((f) => f && String(f).trim()).length;
  return Math.round((filled / fields.length) * 100);
}

export function competencyProgress(skill: DeclaredSkill) {
  const bucket = skillBucket(skill.status);
  if (bucket === "verified") return 100;
  return 0;
}

export function DonutChart({
  verified,
  progress,
  idle,
}: {
  verified: number;
  progress: number;
  idle: number;
}) {
  const total = Math.max(verified + progress + idle, 1);
  const r = 52;
  const c = 2 * Math.PI * r;
  const vLen = (verified / total) * c;
  const pLen = (progress / total) * c;
  const iLen = (idle / total) * c;
  const active = verified + progress + idle;

  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="14" stroke="#e2e8f0" />
        {idle > 0 && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            strokeWidth="14"
            stroke="#cbd5e1"
            strokeDasharray={`${iLen} ${c}`}
            strokeDashoffset={-(vLen + pLen)}
          />
        )}
        {progress > 0 && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            strokeWidth="14"
            stroke="#023E8A"
            strokeDasharray={`${pLen} ${c}`}
            strokeDashoffset={-vLen}
          />
        )}
        {verified > 0 && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            strokeWidth="14"
            stroke="#14b8a6"
            strokeDasharray={`${vLen} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[#023E8A]">{active}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#64748b]">Active</span>
      </div>
    </div>
  );
}

const statIconTints = [
  "bg-[#e8eef7] text-[#023E8A]",
  "bg-[#ecfdf5] text-[#059669]",
  "bg-[#ecfeff] text-[#0891b2]",
  "bg-[#fef9c3] text-[#ca8a04]",
];

/** Smooth area sparklines — curved line + soft fill, no axes (dashboard mock style) */
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

function SparklineArea({ tint = 0 }: { tint?: number }) {
  const series = SPARKLINE_SERIES[tint % SPARKLINE_SERIES.length];
  const areaPath = `${series.curve} L120 40 L0 40 Z`;

  return (
    <svg
      viewBox="0 0 120 40"
      className="mt-3 h-11 w-full overflow-visible"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={areaPath} fill={series.fill} />
      <path
        d={series.curve}
        fill="none"
        stroke={series.stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tint = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  tint?: number;
}) {
  return (
    <div className="learner-stat-card p-5">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", statIconTints[tint % statIconTints.length])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-2xl font-bold text-[#023E8A]">{value}</p>
      <p className="text-sm font-medium text-[#334155]">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-[#64748b]">{hint}</p> : null}
      <SparklineArea tint={tint} />
    </div>
  );
}

export function CompetencyStatusBadges({ status }: { status: string }) {
  const bucket = skillBucket(status);
  if (bucket === "verified") {
    return <span className="learner-tag-linked">Verified</span>;
  }
  if (bucket === "progress") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="learner-tag-progress">In Progress</span>
        {status === "Evidence Linked" && <span className="learner-tag-evidence">Evidence Linked</span>}
      </div>
    );
  }
  return <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-[11px] font-medium text-[#64748b]">Not Started</span>;
}

export function CompetencySkillRow({
  skill,
  onEdit,
  onDelete,
  onOpenPipeline,
}: {
  skill: DeclaredSkill;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPipeline: () => void;
}) {
  const progress = competencyProgress(skill);

  return (
    <li className="group flex items-start gap-3 rounded-xl py-1">
      <div className="learner-competency-icon flex h-11 w-11 shrink-0 items-center justify-center">
        {skillInitials(skill.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#023E8A]">{skill.name}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748b] opacity-0 transition-opacity hover:bg-[#f1f5f9] group-hover:opacity-100 focus:opacity-100"
                aria-label={`Actions for ${skill.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenPipeline}>Open validation pipeline</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit competency</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                Remove competency
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-2">
          <CompetencyStatusBadges status={skill.status} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div className="h-full rounded-full bg-[#14b8a6]" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-medium text-[#64748b]">{progress}% Verification</span>
        </div>
      </div>
    </li>
  );
}

export function OverviewRightRail({
  profile,
  skills,
  reviews,
  completion,
  onDeclare,
}: {
  profile: LearnerProfileView;
  skills: DeclaredSkill[];
  reviews: { id: string }[];
  completion: number;
  onDeclare: () => void;
}) {
  const evidenceCount = skills.filter((s) => skillBucket(s.status) !== "idle").length;

  const copyDid = () => {
    if (!profile.did) return;
    void navigator.clipboard.writeText(profile.did);
    toast({ title: "DID copied to clipboard" });
  };

  return (
    <>
      <div className="learner-stat-card p-5">
        <h3 className="text-sm font-semibold text-[#023E8A]">Quick Actions</h3>
        <div className="mt-4 space-y-2">
          <Button
            type="button"
            onClick={onDeclare}
            className="h-auto min-h-11 w-full !whitespace-normal justify-start rounded-xl px-3 py-2.5 text-left text-sm leading-snug bg-[#023E8A] text-white hover:bg-[#012A5C]"
          >
            <Plus className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Declare New Competency</span>
          </Button>
          {[
            { to: "/learner/integrations", icon: Github, label: "Add Evidence", sub: "Connect GitHub or LMS" },
            { to: "/learner/wallet", icon: Wallet, label: "Open Wallet", sub: "View credentials" },
            { to: "/learner/peer-reviews", icon: MessageSquare, label: "Request Peer Review", sub: "Invite reviewers" },
          ].map(({ to, icon: Icon, label, sub }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3 transition-colors hover:border-[#0ea5e9]/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#023E8A]">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#023E8A]">{label}</p>
                <p className="text-[11px] text-[#64748b]">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="learner-stat-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#023E8A]">My Profile</h3>
          <Link to="/learner/my-profile" className="text-xs font-medium text-[#023E8A] hover:underline">
            Edit
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#023E8A] text-sm font-semibold text-white">
              {profile.avatar}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ccfbf1] px-2 py-0.5 text-[10px] font-medium text-[#0f766e]">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </span>
          </div>
        </div>
        <p className="mt-2 truncate text-xs text-[#64748b]">{profile.email}</p>
        {profile.did ? (
          <button
            type="button"
            onClick={copyDid}
            className="mono mt-1 flex w-full items-center gap-1 truncate text-left text-[10px] text-[#64748b] hover:text-[#023E8A]"
          >
            <span className="truncate">{profile.did}</span>
            <Copy className="h-3 w-3 shrink-0" />
          </button>
        ) : null}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Competencies", value: skills.length },
            { label: "Evidence", value: evidenceCount },
            { label: "Reviews", value: reviews.length },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-lg font-bold text-[#023E8A]">{value}</p>
              <p className="text-[10px] text-[#64748b]">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-[#64748b]">Profile complete</span>
            <span className="font-semibold text-[#023E8A]">{completion}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div className="h-full rounded-full bg-[#14b8a6] transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
        <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#e2e8f0]">
          <Link to="/learner/my-profile">
            <UserCircle className="mr-2 h-4 w-4" />
            View full profile
          </Link>
        </Button>
      </div>

      <div className="learner-dashboard-cta p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-1">
            <p className="text-sm font-semibold leading-snug">Build. Prove. Verify.</p>
            <p className="mt-2 text-xs leading-relaxed text-white/65">
              Add, prove your professional identity with evidence-backed competencies.
            </p>
          </div>
          <VerifyShieldIllustration className="h-14 w-14" />
        </div>
      </div>
    </>
  );
}

export function skillInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

const evidenceIcons = [Github, FileText, BookOpen];

export function evidenceIconForIndex(index: number) {
  return evidenceIcons[index % evidenceIcons.length];
}

export { Award, Layers, Star, BadgeCheck, BookOpen, Github, FileText };

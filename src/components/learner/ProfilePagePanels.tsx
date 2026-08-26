import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Github,
  MessageSquare,
  Plus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearnerProfileView } from "@/lib/db/learner-profile";
import { cn } from "@/lib/utils";

export function profileChecklist(profile: LearnerProfileView) {
  const personal = Boolean(
    profile.contactNumber?.trim() &&
      profile.bio?.trim() &&
      profile.city?.trim() &&
      profile.country?.trim(),
  );
  const education = Boolean(
    (profile.institution && profile.institution !== "—") ||
      (profile.program && profile.program !== "—"),
  );
  const interests = Boolean(profile.skillsSummary?.trim());
  const links = Boolean(profile.githubUrl?.trim() || profile.linkedinUrl?.trim());
  return [
    { id: "personal", label: "Personal Information", done: personal },
    { id: "education", label: "Education", done: education },
    { id: "interests", label: "Areas of Interest", done: interests },
    { id: "links", label: "Professional Links", done: links },
  ];
}

export function profileCompletenessPercent(profile: LearnerProfileView) {
  const items = profileChecklist(profile);
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

function CompletenessRing({ percent }: { percent: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const len = (percent / 100) * c;

  return (
    <div className="relative mx-auto h-24 w-24">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="#14b8a6"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${len} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-[#023E8A]">{percent}%</span>
        <span className="text-[9px] uppercase tracking-wide text-[#64748b]">Complete</span>
      </div>
    </div>
  );
}

export function ProfileCompletenessCard({ profile }: { profile: LearnerProfileView }) {
  const percent = profileCompletenessPercent(profile);
  const items = profileChecklist(profile);

  return (
    <div className="learner-stat-card p-5">
      <h3 className="text-sm font-semibold text-[#023E8A]">Profile Completeness</h3>
      <div className="mt-4 flex flex-col items-center">
        <CompletenessRing percent={percent} />
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                item.done ? "border-[#14b8a6] bg-[#ccfbf1] text-[#0f766e]" : "border-[#cbd5e1] bg-white",
              )}
            >
              {item.done ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                  <path
                    d="M2 6 L5 9 L10 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className={item.done ? "text-[#334155]" : "text-[#64748b]"}>{item.label}</span>
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#e2e8f0] text-sm">
        <a href="#profile-top">View Full Profile</a>
      </Button>
    </div>
  );
}

export function ProfileQuickActionsCard() {
  const navigate = useNavigate();

  const actions = [
    {
      label: "Declare New Competency",
      icon: Plus,
      onClick: () => navigate("/learner/profile"),
    },
    {
      label: "Add Evidence",
      icon: Github,
      to: "/learner/integrations",
    },
    {
      label: "Open Wallet",
      icon: Wallet,
      to: "/learner/wallet",
    },
    {
      label: "Request Peer Review",
      icon: MessageSquare,
      to: "/learner/peer-reviews",
    },
  ];

  return (
    <div className="learner-stat-card p-5">
      <h3 className="text-sm font-semibold text-[#023E8A]">Quick Actions</h3>
      <ul className="mt-4 space-y-1">
        {actions.map(({ label, icon: Icon, to, onClick }) => (
          <li key={label}>
            {to ? (
              <Link
                to={to}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9]"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#023E8A]" />
                <span className="min-w-0 flex-1">{label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onClick}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9]"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#023E8A]" />
                <span className="min-w-0 flex-1">{label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProfilePageRightRail({ profile }: { profile: LearnerProfileView }) {
  return (
    <>
      <ProfileCompletenessCard profile={profile} />
      <ProfileQuickActionsCard />
    </>
  );
}

export function formatProfileDate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function shortDid(did: string) {
  if (did.length <= 20) return did;
  return `${did.slice(0, 12)}…${did.slice(-4)}`;
}

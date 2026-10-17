import { Link } from "react-router-dom";
import { Briefcase, CalendarClock, ChevronRight, GitCompare, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecruiterProfileView } from "@/lib/db/recruiter-profile";
import { cn } from "@/lib/utils";

export function recruiterProfileChecklist(profile: RecruiterProfileView) {
  return [
    { id: "personal", label: "Personal Information", done: Boolean(profile.contactNumber?.trim()) },
    {
      id: "company",
      label: "Company",
      done: Boolean(profile.companyName.trim() && profile.jobTitle.trim()),
    },
    { id: "focus", label: "Hiring Focus", done: Boolean(profile.reason?.trim()) },
    {
      id: "links",
      label: "Professional Links",
      done: Boolean(profile.linkedinUrl?.trim() || profile.companyWebsite?.trim()),
    },
  ];
}

export function recruiterProfileCompletenessPercent(profile: RecruiterProfileView) {
  const items = recruiterProfileChecklist(profile);
  const done = items.filter((item) => item.done).length;
  return Math.round((done / items.length) * 100);
}

function CompletenessRing({ percent }: { percent: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const length = (percent / 100) * circumference;

  return (
    <div className="relative mx-auto h-24 w-24">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="#14b8a6"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${length} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-[#023E8A]">{percent}%</span>
        <span className="text-[9px] uppercase tracking-wide text-[#64748b]">Complete</span>
      </div>
    </div>
  );
}

export function RecruiterProfileCompletenessCard({ profile }: { profile: RecruiterProfileView }) {
  const percent = recruiterProfileCompletenessPercent(profile);
  const items = recruiterProfileChecklist(profile);

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

export function RecruiterProfileQuickActionsCard() {
  const actions = [
    { label: "Open directory", icon: LayoutDashboard, to: "/recruiter/search" },
    { label: "Open jobs", icon: Briefcase, to: "/recruiter/jobs" },
    { label: "View interviews", icon: CalendarClock, to: "/recruiter/interviews" },
    { label: "Compare candidates", icon: GitCompare, to: "/recruiter/compare" },
  ];

  return (
    <div className="learner-stat-card p-5">
      <h3 className="text-sm font-semibold text-[#023E8A]">Quick Actions</h3>
      <ul className="mt-4 space-y-1">
        {actions.map(({ label, icon: Icon, to }) => (
          <li key={label}>
            <Link
              to={to}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-[#334155] transition-colors hover:bg-[#f1f5f9]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#023E8A]" />
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecruiterProfileRightRail({ profile }: { profile: RecruiterProfileView }) {
  return (
    <>
      <RecruiterProfileCompletenessCard profile={profile} />
      <RecruiterProfileQuickActionsCard />
    </>
  );
}

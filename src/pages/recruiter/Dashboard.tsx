import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  GitCompare,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { formatTimestamp } from "@/components/zkp/policy-outcome";
import { useAuth } from "@/hooks/useAuth";
import { useCandidates } from "@/hooks/useCandidates";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { listInterviewsApi } from "@/services/api/interview.api";
import {
  deleteShortlist,
  listSharedCompetencyVersions,
  listShortlist,
  saveShortlist,
  type SharedCompetencyVersion,
} from "@/services/api/recruiter-workspace.api";
import { readRecruiterShortlist, writeRecruiterShortlist } from "@/components/recruiter/RecruiterDashboardPanels";
import { listRecruiterJobs } from "@/lib/recruiter-jobs";
import type { CandidateView } from "@/lib/db/candidates";
import type { ScheduledInterviewView } from "@/lib/interview";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "C").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function verificationLabel(candidate: CandidateView) {
  if (candidate.attestation === "Approved") return "Disclosed as verified";
  if (candidate.attestation === "Partial") return "Partly disclosed";
  return "Verification not disclosed";
}

function anchorLabel(status: SharedCompetencyVersion["anchorStatus"]) {
  if (status === "confirmed") return "Blockchain anchor confirmed";
  if (status === "failed") return "Blockchain anchor failed";
  if (status === "unavailable") return "Blockchain anchor unavailable";
  return "Blockchain anchor not requested";
}

function skillCounts(candidates: CandidateView[]) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const named = candidate.verifiedSkills?.length
      ? candidate.verifiedSkills
      : candidate.searchableSkills?.length
        ? candidate.searchableSkills
        : candidate.topSkill && candidate.topSkill !== "—"
          ? [candidate.topSkill]
          : [];
    for (const skill of named) {
      const label = skill.trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 6);
}

function WelcomeArt() {
  return (
    <svg viewBox="0 0 460 280" className="h-auto w-full max-w-[460px]" aria-hidden>
      <circle cx="360" cy="48" r="70" fill="white" fillOpacity="0.08" />
      <circle cx="78" cy="210" r="54" fill="white" fillOpacity="0.07" />
      <rect x="36" y="168" width="150" height="22" rx="6" fill="#93c5fd" />
      <rect x="58" y="142" width="150" height="22" rx="6" fill="#60a5fa" />
      <rect x="80" y="116" width="150" height="22" rx="6" fill="#dbeafe" />
      <rect x="168" y="42" width="250" height="168" rx="22" fill="white" fillOpacity="0.96" />
      <rect x="188" y="64" width="210" height="108" rx="14" fill="#e8f1ff" />
      <rect x="206" y="84" width="92" height="10" rx="5" fill="#93c5fd" />
      <rect x="206" y="104" width="132" height="8" rx="4" fill="#bfdbfe" />
      <rect x="206" y="122" width="108" height="8" rx="4" fill="#bfdbfe" />
      <circle cx="338" cy="118" r="28" fill="#14b8a6" />
      <path d="M326 118 l8 8 16-18" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="392" cy="58" r="26" fill="#22c55e" />
      <path d="M381 58 l7 7 14-16" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="196" y="184" width="72" height="10" rx="5" fill="#dbeafe" />
      <rect x="278" y="184" width="48" height="10" rx="5" fill="#ccfbf1" />
    </svg>
  );
}

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const { candidates, loading, error } = useCandidates();
  const { profile } = useRecruiterProfile(true);
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [openJobs, setOpenJobs] = useState(0);
  const [shortlistMode, setShortlistMode] = useState<"account" | "browser" | "unknown">("unknown");
  const [selected, setSelected] = useState<string[]>(() => readRecruiterShortlist());
  const [versions, setVersions] = useState<Array<SharedCompetencyVersion & { candidateName: string; candidateId: string }>>([]);
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listInterviewsApi().then((rows) => { if (active) setInterviews(rows); }).catch(() => { if (active) setInterviews([]); });
    if (user?.id) {
      listRecruiterJobs(user.id)
        .then((rows) => { if (active) setOpenJobs(rows.filter((job) => job.status === "open").length); })
        .catch(() => { if (active) setOpenJobs(0); });
    }
    listShortlist()
      .then((result) => {
        if (!active) return;
        if (result?.available) {
          setShortlistMode("account");
          setSelected(result.entries.map((entry) => entry.learnerUserId));
        } else {
          setShortlistMode("browser");
        }
      })
      .catch(() => { if (active) setShortlistMode("browser"); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const recent = [...candidates].sort((a, b) => Date.parse(b.sharedAt ?? "") - Date.parse(a.sharedAt ?? "")).slice(0, 4);
    Promise.all(recent.map(async (candidate) => {
      const result = await listSharedCompetencyVersions(candidate.id).catch(() => null);
      return (result?.available ? result.versions : [])
        .filter((version) => version.status === "issued")
        .map((version) => ({ ...version, candidateName: candidate.name, candidateId: candidate.id }));
    })).then((groups) => { if (active) setVersions(groups.flat()); });
    return () => { active = false; };
  }, [candidates]);

  const toggleShortlist = (id: string) => {
    setShortlistError(null);
    const current = selected;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    setSelected(next);
    if (shortlistMode !== "account") {
      writeRecruiterShortlist(next);
      return;
    }
    const action = current.includes(id) ? deleteShortlist(id) : saveShortlist(id);
    void action.catch(() => {
      setSelected(current);
      setShortlistError("The shortlist could not be saved.");
    });
  };

  if (loading) return <AppShell role="recruiter"><PageSkeleton rows={4} /></AppShell>;

  const recruiterName = profile?.fullName?.trim() || "Recruiter";
  const credentialTotal = candidates.reduce((total, candidate) => total + (candidate.credentialCount ?? 0), 0);
  const withCredentials = candidates.filter((candidate) => (candidate.credentialCount ?? 0) > 0).length;
  const verifiedZkpTotal = candidates.reduce((total, candidate) => total + (candidate.confirmedPrivateResults ?? 0), 0);
  const verifiedCredentialCandidates = candidates.filter((candidate) => candidate.attestation === "Approved").length;
  const upcoming = interviews.filter((row) => Date.parse(row.scheduledAt) >= Date.now());
  const recent = [...candidates].sort((a, b) => Date.parse(b.sharedAt ?? "") - Date.parse(a.sharedAt ?? "")).slice(0, 4);
  const skills = skillCounts(candidates);
  const skillMax = Math.max(1, ...skills.map(([, count]) => count));
  const highlights = versions.slice(0, 3);

  const kpis = [
    {
      label: "Shared Candidates",
      value: candidates.length,
      hint: "Profiles shared with your recruiter account",
      to: "/recruiter/search",
      icon: Users,
      accent: "bg-[#eff6ff] text-[#1d4ed8]",
    },
    {
      label: "Shared Credentials",
      value: credentialTotal,
      hint: `${withCredentials} ${withCredentials === 1 ? "candidate has" : "candidates have"} at least one credential`,
      to: "/recruiter/search",
      icon: ShieldCheck,
      accent: "bg-[#f0fdfa] text-[#0f766e]",
    },
    {
      label: "Verified Credentials / ZKP",
      value: verifiedZkpTotal,
      hint: `${verifiedCredentialCandidates} ${verifiedCredentialCandidates === 1 ? "candidate" : "candidates"} disclosed as verified`,
      to: "/recruiter/search",
      icon: ShieldCheck,
      accent: "bg-[#ecfdf5] text-[#047857]",
    },
    {
      label: "Active Job Postings",
      value: openJobs,
      hint: `Upcoming interviews: ${upcoming.length}`,
      to: "/recruiter/jobs",
      icon: Briefcase,
      accent: "bg-[#eff6ff] text-[#1d4ed8]",
    },
  ];

  return (
    <AppShell role="recruiter" contentClassName="bg-[#F4F7FC]">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-[#0B1F46]">Recruitment Intelligence</h1>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-6 text-[#52627a]">Discover evidence-based talent, review verified credentials, and track skill development.</p>
        </header>

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1F46] via-[#163872] to-[#2563EB] text-white shadow-[0_18px_40px_-24px_rgba(11,31,70,0.65)]">
          <div className="grid items-center gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="px-6 py-7 sm:px-8 sm:py-8">
              <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-white/70">Recruiter workspace</p>
              <h2 className="mt-2 text-[28px] font-semibold leading-tight sm:text-[32px]">Welcome back, {recruiterName}</h2>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/80">Find and evaluate talent with verified skills and real evidence from learning, practical work, and GitHub.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/recruiter/search" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[15px] font-semibold text-[#0B1F46] shadow-sm transition hover:bg-[#e8f1ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <Search className="h-4 w-4" /> Explore Candidates
                </Link>
                <Link to="/recruiter/compare" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <GitCompare className="h-4 w-4" /> Compare Candidates
                </Link>
              </div>
            </div>
            <div className="hidden min-h-[230px] items-center justify-center px-4 py-6 sm:flex">
              <WelcomeArt />
            </div>
          </div>
        </section>

        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-[15px] text-red-700" role="alert">{error}</p> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((card) => (
            <Link key={card.label} to={card.to} className="group rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(11,31,70,0.45)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-20px_rgba(11,31,70,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", card.accent)}><card.icon className="h-5 w-5" /></span>
              <p className="mt-5 text-[36px] font-semibold leading-none tracking-tight text-[#0B1F46]">{card.value}</p>
              <p className="mt-3 text-[15px] font-semibold text-[#16324f]">{card.label}</p>
              <p className="mt-1 text-[14px] leading-5 text-[#64748b]">{card.hint}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(11,31,70,0.45)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[19px] font-semibold text-[#0B1F46]">Recently Shared Candidates</h2>
              <Link to="/recruiter/search" className="text-[14px] font-semibold text-[#2563EB] hover:underline">View Directory</Link>
            </div>
            {shortlistMode === "browser" ? <p className="mt-2 text-[14px] leading-5 text-[#64748b]">Shortlist stays in this browser until account shortlist storage is applied.</p> : null}
            {shortlistError ? <p className="mt-2 text-[14px] text-red-700" role="alert">{shortlistError}</p> : null}
            {recent.length === 0 ? <p className="mt-5 text-[15px] text-[#64748b]">No shared candidates yet.</p> : (
              <ul className="mt-4 space-y-3">
                {recent.map((candidate) => {
                  const skillsShown = (candidate.verifiedSkills?.length ? candidate.verifiedSkills : candidate.searchableSkills ?? []).slice(0, 3);
                  const saved = selected.includes(candidate.id);
                  return (
                    <li key={candidate.id} className="flex flex-col gap-4 rounded-2xl bg-[#F7F9FD] p-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        {candidate.avatarUrl ? <img src={candidate.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-4 ring-white" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dbeafe] text-[18px] font-semibold text-[#1d4ed8] ring-4 ring-white">{initials(candidate.name)}</span>}
                        <div className="min-w-0">
                          <p className="truncate text-[18px] font-semibold leading-6 text-[#0B1F46]">{candidate.name}</p>
                          <p className="mt-0.5 text-[14px] text-[#64748b]">{candidate.sharedAt ? `Shared on ${formatTimestamp(candidate.sharedAt)}` : "Share date not recorded"}</p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {skillsShown.map((skill) => <span key={skill} className="rounded-full bg-[#dbeafe] px-2.5 py-1 text-[13px] font-semibold text-[#1d4ed8]">{skill}</span>)}
                            <span className="rounded-full bg-white px-2.5 py-1 text-[13px] font-medium text-[#334155]">{candidate.credentialCount} {candidate.credentialCount === 1 ? "Credential" : "Credentials"}</span>
                            <span className={cn("rounded-full px-2.5 py-1 text-[13px] font-semibold", candidate.attestation === "Approved" ? "bg-[#ccfbf1] text-[#0f766e]" : "bg-white text-[#475569]")}>{verificationLabel(candidate)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link to={`/recruiter/candidate/${candidate.id}`} className="rounded-xl bg-[#0B1F46] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#16325c]">View Profile</Link>
                        <button type="button" onClick={() => toggleShortlist(candidate.id)} className={cn("rounded-xl px-4 py-2.5 text-[14px] font-semibold transition", saved ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-white text-[#0B1F46] hover:bg-[#eef4ff]")}>{saved ? "Shortlisted" : "Shortlist"}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(11,31,70,0.45)] sm:p-6">
            <h2 className="text-[19px] font-semibold text-[#0B1F46]">Hiring activity</h2>
            <ul className="mt-4 space-y-2">
              {[
                { label: "Shared Candidates", count: candidates.length, to: "/recruiter/search", icon: Users, accent: "bg-[#eff6ff] text-[#1d4ed8]" },
                { label: "Confirmed private ZKP results", count: verifiedZkpTotal, to: "/recruiter/search", icon: ShieldCheck, accent: "bg-[#ecfdf5] text-[#047857]" },
                { label: "Active Job Postings", count: openJobs, to: "/recruiter/jobs", icon: Briefcase, accent: "bg-[#eff6ff] text-[#1d4ed8]" },
                { label: "Upcoming Interviews", count: upcoming.length, to: "/recruiter/interviews", icon: CalendarClock, accent: "bg-[#f5f3ff] text-[#6d28d9]" },
              ].map((row) => (
                <li key={row.label}>
                  <Link to={row.to} className="flex min-h-[68px] items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-[#F4F7FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", row.accent)}><row.icon className="h-5 w-5" /></span>
                    <span className="flex-1 text-[15px] font-medium text-[#16324f]">{row.label}</span>
                    <span className="rounded-full bg-[#F4F7FC] px-3 py-1 text-[15px] font-semibold text-[#0B1F46]">{row.count}</span>
                    <ArrowRight className="h-4 w-4 text-[#94a3b8]" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] leading-5 text-[#64748b]">
              Recruiters review proofs learners already shared. New proof requests are not started from this workspace.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(11,31,70,0.45)] sm:p-6">
            <h2 className="text-[19px] font-semibold text-[#0B1F46]">Verified Skill Insights</h2>
            <p className="mt-1 text-[14px] text-[#64748b]">Skills from disclosed candidate profiles</p>
            {skills.length === 0 ? <p className="mt-5 text-[15px] text-[#64748b]">No disclosed skills yet.</p> : (
              <ul className="mt-5 space-y-4">
                {skills.map(([skill, count]) => (
                  <li key={skill}>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-medium text-[#16324f]">{skill}</span>
                      <span className="text-[14px] text-[#64748b]">{count} {count === 1 ? "candidate" : "candidates"}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#e8eef7]"><div className="h-2.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#0D9488]" style={{ width: `${Math.max(12, (count / skillMax) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(11,31,70,0.45)] sm:p-6">
            <h2 className="text-[19px] font-semibold text-[#0B1F46]">Longitudinal Skill Highlights</h2>
            <p className="mt-1 text-[14px] text-[#64748b]">Verified skill progression from shared credential versions</p>
            {highlights.length === 0 ? (
              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[#F4F7FC] px-4 py-5">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2563EB] shadow-sm"><ShieldCheck className="h-7 w-7" /></span>
                <p className="text-[15px] leading-6 text-[#52627a]">Verified skill progression will appear here as learners share new credential versions.</p>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {highlights.map((version) => (
                  <li key={version.id} className="rounded-2xl bg-[#F4F7FC] p-4">
                    <p className="text-[16px] font-semibold text-[#0B1F46]">{version.candidateName} · {version.skillName}</p>
                    <p className="mt-1 text-[14px] leading-6 text-[#334155]">Version {version.versionNumber} · Issued {formatTimestamp(version.createdAt)}</p>
                    <p className="text-[14px] leading-6 text-[#52627a]">{version.hasCredential ? "Signed credential recorded" : "Signature not recorded"}. {anchorLabel(version.anchorStatus)}.</p>
                    <Link to={`/recruiter/candidate/${version.candidateId}?tab=journey`} className="mt-2 inline-flex text-[14px] font-semibold text-[#2563EB] hover:underline">Skill Growth</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

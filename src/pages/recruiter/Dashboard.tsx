import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bookmark, CalendarDays, Sparkles } from "lucide-react";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { SijilMatchBot } from "@/components/recruiter/SijilMatchBot";
import {
  isUpcomingInterview,
  readRecruiterShortlist,
  writeRecruiterShortlist,
} from "@/components/recruiter/RecruiterDashboardPanels";
import { useCandidates } from "@/hooks/useCandidates";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { listInterviewsApi } from "@/services/api/interview.api";
import {
  deleteShortlist,
  listShortlist,
  saveShortlist,
} from "@/services/api/recruiter-workspace.api";
import "./recruiter-dashboard.css";
import type { ScheduledInterviewView } from "@/lib/interview";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "C").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function formatSharedDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function RecruiterDashboard() {
  const navigate = useNavigate();
  const { candidates, candidateSkills, loading, error } = useCandidates();
  useRecruiterProfile(true);
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [shortlistMode, setShortlistMode] = useState<"account" | "browser" | "unknown">("unknown");
  const [selected, setSelected] = useState<string[]>(() => readRecruiterShortlist());
  const [updatingShortlist, setUpdatingShortlist] = useState(false);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [tab, setTab] = useState<"recent" | "shortlist">("recent");
  const [focusIds, setFocusIds] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    listInterviewsApi().then((rows) => { if (active) setInterviews(rows); }).catch(() => { if (active) setInterviews([]); });
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
  }, []);

  const toggleShortlist = (id: string) => {
    if (updatingShortlist || shortlistMode === "unknown") return;
    setShortlistError(null);
    const current = selected;
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= 4
        ? current
        : [...current, id];
    if (next.length === current.length) {
      setShortlistError("You can shortlist up to four candidates.");
      return;
    }
    setSelected(next);
    writeRecruiterShortlist(next);
    if (shortlistMode === "account") {
      setUpdatingShortlist(true);
      const action = current.includes(id) ? deleteShortlist(id) : saveShortlist(id);
      void action.catch(() => {
        setSelected(current);
        writeRecruiterShortlist(current);
        setShortlistError("Could not update shortlist.");
      }).finally(() => setUpdatingShortlist(false));
    }
  };

  if (loading) {
    return (
      <RecruiterWorkspaceShell dashboardLayout>
        <PageSkeleton rows={4} />
      </RecruiterWorkspaceShell>
    );
  }

  const upcoming = interviews.filter(isUpcomingInterview);
  const visible = [...candidates]
    .filter((candidate) => !focusIds || focusIds.includes(candidate.id))
    .sort((a, b) => (Date.parse(b.sharedAt ?? "") || 0) - (Date.parse(a.sharedAt ?? "") || 0));
  const rows = tab === "shortlist"
    ? visible.filter((candidate) => selected.includes(candidate.id))
    : visible.slice(0, 3);

  return (
    <RecruiterWorkspaceShell dashboardLayout>
      <div className="recruiter-dashboard space-y-4">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <section className="recruiter-match-hero" aria-labelledby="recruiter-match-title">
          <h1 id="recruiter-match-title" className="flex items-center gap-3 text-2xl font-bold">
            <Sparkles className="size-6 shrink-0" aria-hidden="true" /> SIJIL Match
          </h1>
          <p className="mb-3 mt-1 text-sm text-blue-50">Find the right skills from profiles shared with you.</p>
          <SijilMatchBot
            candidates={candidates}
            candidateSkills={candidateSkills}
            selectedIds={tab === "shortlist" ? selected : []}
            onResultIds={setFocusIds}
            onOpenCandidate={(id) => navigate("/recruiter/candidate/" + id)}
          />
        </section>
        <section className="recruiter-dashboard-card" aria-labelledby="recruiter-shared-profiles">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2 pt-3 sm:px-4">
            <h2 id="recruiter-shared-profiles" className="text-lg font-bold text-sijil-blue">Shared Profiles</h2>
            <Link to="/recruiter/search" className="recruiter-dashboard-link">
              View all profiles <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mx-3 flex items-center gap-2 border-b border-blue-100 sm:mx-4">
            {(["recent", "shortlist"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={tab === item}
                onClick={() => { setTab(item); setFocusIds(null); }}
                className={cn("border-b-2 px-3 py-2.5 text-xs font-medium",
                  tab === item ? "border-sijil-blue font-semibold text-sijil-blue" : "border-transparent text-slate-600 hover:text-sijil-blue")}>
                {item === "recent" ? "Recently shared (" + candidates.length + ")" : "Shortlisted"}
              </button>
            ))}
            {tab === "shortlist" && selected.length >= 2 && (
              <Link to={"/recruiter/compare?" + new URLSearchParams({ ids: selected.join(",") })}
                className="ml-auto text-xs font-semibold text-sijil-blue hover:underline">Compare shortlisted</Link>
            )}
            {focusIds && <button type="button" className="ml-auto text-xs text-sijil-blue underline" onClick={() => setFocusIds(null)}>Clear filter</button>}
          </div>
          {shortlistError && <p role="alert" className="mx-4 mt-2 text-sm text-red-700">{shortlistError}</p>}
          <div className="m-3 overflow-x-auto rounded-lg border border-blue-100 sm:m-4">
            <table className="w-full min-w-[38rem] text-left text-xs">
              <thead className="bg-[#eff5fc] text-sijil-blue">
                <tr>{["Candidate", "Shared skills", "Credentials", "Date shared", "Action"].map((label) => (
                  <th key={label} scope="col" className="px-3 py-2.5 font-semibold">{label}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-slate-700">
                {rows.map((candidate) => {
                  const skills = (candidate.verifiedSkills?.length ? candidate.verifiedSkills : candidate.searchableSkills ?? []).slice(0, 2);
                  const count = candidate.credentialCount ?? 0;
                  const saved = selected.includes(candidate.id);
                  return (
                    <tr key={candidate.id}>
                      <th scope="row" className="px-3 py-3">
                        <div className="flex items-center gap-3 text-sijil-blue">
                          {candidate.avatarUrl
                            ? <img src={candidate.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                            : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#dfebfa] font-bold">{initials(candidate.name)}</span>}
                          <span className="break-words font-semibold">{candidate.name}</span>
                        </div>
                      </th>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {skills.length ? skills.map((skill) => (
                            <span key={skill} className="rounded-md bg-[#e6f0fc] px-2 py-1 text-sijil-blue">{skill}</span>
                          )) : <span>Unavailable</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">{count} {count === 1 ? "credential" : "credentials"}</td>
                      <td className="whitespace-nowrap px-3 py-3">{formatSharedDate(candidate.sharedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <Link to={"/recruiter/candidate/" + encodeURIComponent(candidate.id)}
                            className="whitespace-nowrap rounded-lg border border-sijil-blue/45 px-3 py-1.5 font-semibold text-sijil-blue hover:bg-blue-50">
                            View profile
                          </Link>
                          <button type="button" aria-label={"Shortlist " + candidate.name} aria-pressed={saved}
                            disabled={updatingShortlist || shortlistMode === "unknown"} onClick={() => toggleShortlist(candidate.id)}
                            className="rounded-lg p-1.5 text-sijil-blue hover:bg-blue-50 disabled:opacity-50">
                            <Bookmark className={cn("size-4", saved && "fill-current")} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-sm text-slate-600">
                    {focusIds ? "No shared profiles match this search." : tab === "shortlist" ? "No shortlisted profiles yet." : "No profiles have been shared with you yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="recruiter-dashboard-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#e0edfc] text-sijil-blue">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-sijil-blue">Upcoming Interviews</h2>
              <p className="text-xs text-slate-600">{upcoming.length} scheduled {upcoming.length === 1 ? "interview" : "interviews"}</p>
            </div>
          </div>
          <Link to="/recruiter/interviews" className="recruiter-dashboard-link">
            View schedule <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </RecruiterWorkspaceShell>
  );
}

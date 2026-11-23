import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CalendarClock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { StatCard } from "@/components/learner/OverviewDashboardPanels";
import { SijilMatchBot } from "@/components/recruiter/SijilMatchBot";
import {
  RecruiterDashboardRail,
  readRecruiterShortlist,
  writeRecruiterShortlist,
} from "@/components/recruiter/RecruiterDashboardPanels";
import { formatTimestamp } from "@/components/zkp/policy-outcome";
import { useCandidates } from "@/hooks/useCandidates";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { listInterviewsApi } from "@/services/api/interview.api";
import {
  deleteShortlist,
  listShortlist,
  saveShortlist,
} from "@/services/api/recruiter-workspace.api";
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

export default function RecruiterDashboard() {
  const navigate = useNavigate();
  const { candidates, candidateSkills, loading, error } = useCandidates();
  useRecruiterProfile(true);
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [shortlistMode, setShortlistMode] = useState<"account" | "browser" | "unknown">("unknown");
  const [selected, setSelected] = useState<string[]>(() => readRecruiterShortlist());
  const [shortlistError, setShortlistError] = useState<string | null>(null);
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
    setShortlistError(null);
    const current = selected;
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= 4
        ? current
        : [...current, id];
    setSelected(next);
    writeRecruiterShortlist(next);
    if (shortlistMode === "account" && next.length !== current.length) {
      const action = current.includes(id) ? deleteShortlist(id) : saveShortlist(id);
      void action.catch(() => {
        setSelected(current);
        writeRecruiterShortlist(current);
        setShortlistError("Could not update shortlist.");
      });
    }
  };

  if (loading) {
    return (
      <RecruiterWorkspaceShell>
        <PageSkeleton rows={4} />
      </RecruiterWorkspaceShell>
    );
  }

  const credentialTotal = candidates.reduce((total, candidate) => total + (candidate.credentialCount ?? 0), 0);
  const upcoming = interviews.filter((row) => Date.parse(row.scheduledAt) >= Date.now());
  const recentAll = [...candidates]
    .sort((a, b) => Date.parse(b.sharedAt ?? "") - Date.parse(a.sharedAt ?? ""))
    .filter((candidate) => !focusIds || focusIds.includes(candidate.id));
  const recent = recentAll.slice(0, 3);

  const kpis = [
    {
      label: "Learners",
      value: candidates.length,
      hint: "Shared with you",
      to: "/recruiter/search",
      icon: Users,
      tint: 0,
    },
    {
      label: "Credentials",
      value: credentialTotal,
      hint: "Active evidence packs",
      to: "/recruiter/search",
      icon: ShieldCheck,
      tint: 1,
    },
    {
      label: "Compare",
      value: selected.length,
      hint: "Shortlisted now",
      to: "/recruiter/compare",
      icon: BadgeCheck,
      tint: 2,
    },
    {
      label: "Interviews",
      value: upcoming.length,
      hint: "Coming up next",
      to: "/recruiter/interviews",
      icon: CalendarClock,
      tint: 3,
    },
  ];

  const rightRail = (
    <RecruiterDashboardRail
      selectedCount={selected.length}
      onCompare={() => {
        if (selected.length >= 2) {
          navigate(`/recruiter/compare?ids=${selected.join(",")}`);
          return;
        }
        navigate("/recruiter/search");
      }}
    />
  );

  return (
    <RecruiterWorkspaceShell rightRail={rightRail}>
      <div className="space-y-6">
        {error ? (
          <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="block rounded-xl transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]"
            >
              <StatCard
                icon={card.icon}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tint={card.tint}
              />
            </Link>
          ))}
        </div>

        <section className="learner-stat-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef7] text-[#023E8A]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#023E8A]">Ask SIJIL Match</h2>
              <p className="text-xs text-[#64748b]">
                Describe the role or skills you need — AI ranks the best shared learners.
              </p>
            </div>
          </div>
          <SijilMatchBot
            candidates={candidates}
            candidateSkills={candidateSkills}
            selectedIds={selected}
            onClearSelection={() => setSelected([])}
            onResultIds={setFocusIds}
            onOpenCandidate={(id) => navigate(`/recruiter/candidate/${id}`)}
            onCompare={(leftId, rightId) => navigate(`/recruiter/compare?ids=${leftId},${rightId}`)}
          />
        </section>

        <section className="learner-stat-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#023E8A]">Recently Shared</h2>
              <p className="mt-0.5 text-xs text-[#64748b]">Latest profiles shared with your account</p>
            </div>
            {focusIds ? (
              <button
                type="button"
                onClick={() => setFocusIds(null)}
                className="text-xs font-medium text-[#023E8A] hover:underline"
              >
                Clear filter
              </button>
            ) : null}
          </div>
          {shortlistError ? (
            <p className="border-b border-[#fecaca] bg-[#fef2f2] px-5 py-2 text-sm text-[#dc2626]" role="alert">
              {shortlistError}
            </p>
          ) : null}
          {recent.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#64748b]">No shared learners yet.</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {recent.map((candidate) => {
                const skillsShown = (candidate.verifiedSkills?.length
                  ? candidate.verifiedSkills
                  : candidate.searchableSkills ?? []
                ).slice(0, 2);
                const saved = selected.includes(candidate.id);
                return (
                  <li
                    key={candidate.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {candidate.avatarUrl ? (
                        <img
                          src={candidate.avatarUrl}
                          alt=""
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-[#e8eef7]"
                        />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8eef7] text-sm font-semibold text-[#023E8A]">
                          {initials(candidate.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#023E8A]">{candidate.name}</p>
                        <p className="mt-0.5 text-xs text-[#64748b]">
                          {candidate.sharedAt
                            ? `Shared ${formatTimestamp(candidate.sharedAt)}`
                            : "Recently shared"}
                          {" · "}
                          {candidate.credentialCount}{" "}
                          {candidate.credentialCount === 1 ? "credential" : "credentials"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {skillsShown.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full bg-[#e8eef7] px-2 py-0.5 text-[10px] font-semibold text-[#023E8A]"
                            >
                              {skill}
                            </span>
                          ))}
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              candidate.attestation === "Approved"
                                ? "bg-[#ecfdf5] text-[#059669]"
                                : "bg-[#f1f5f9] text-[#64748b]",
                            )}
                          >
                            {verificationLabel(candidate)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        to={`/recruiter/candidate/${candidate.id}?tab=journey`}
                        className="rounded-xl bg-[#023E8A] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#012A5C]"
                      >
                        Longitudinal Journey
                      </Link>
                      <Link
                        to={`/recruiter/candidate/${candidate.id}`}
                        className="rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2 text-xs font-semibold text-[#023E8A] transition hover:bg-[#f8fafc]"
                      >
                        Review
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleShortlist(candidate.id)}
                        className={cn(
                          "rounded-xl px-3.5 py-2 text-xs font-semibold transition",
                          saved
                            ? "bg-[#e8eef7] text-[#023E8A]"
                            : "border border-[#e2e8f0] bg-white text-[#023E8A] hover:bg-[#f8fafc]",
                        )}
                      >
                        {saved ? "Shortlisted" : "Shortlist"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[#e2e8f0] px-5 py-3">
            <Link
              to="/recruiter/search"
              className="inline-flex items-center text-sm font-semibold text-[#023E8A] hover:underline"
            >
              See all in Directory
              {recentAll.length > recent.length ? ` (${recentAll.length})` : ""}
            </Link>
          </div>
        </section>
      </div>
    </RecruiterWorkspaceShell>
  );
}

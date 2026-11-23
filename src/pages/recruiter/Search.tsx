import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { ChevronDown, Filter, LayoutGrid, List, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/sijil/EmptyState";
import { RecruiterCandidateCard } from "@/components/recruiter/RecruiterCandidateCard";
import type { RecruiterStatFilter } from "@/components/recruiter/RecruiterDashboardStats";
import {
  RecruiterRecentActivity,
  RecruiterUpcomingInterviews,
} from "@/components/recruiter/RecruiterDashboardPanels";
import { useCandidates } from "@/hooks/useCandidates";
import { listInterviewsApi } from "@/services/api/interview.api";
import type { ScheduledInterviewView } from "@/lib/interview";

export default function RecruiterSearch() {
  const navigate = useNavigate();
  const { candidates, loading, error, refresh } = useCandidates();
  const [interviews, setInterviews] = useState<ScheduledInterviewView[]>([]);
  const [statFilter, setStatFilter] = useState<RecruiterStatFilter>("all");
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("all");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (statFilter === "verified" && candidate.attestation !== "Approved") return false;
      if (statFilter === "credentials" && (candidate.credentialCount ?? 0) <= 0) return false;
      if (skill !== "all") {
        const skills = [...(candidate.verifiedSkills ?? []), ...(candidate.searchableSkills ?? []), candidate.topSkill];
        if (!skills.some((item) => item?.trim().toLowerCase() === skill)) return false;
      }
      if (!needle) return true;
      const haystack = [
        candidate.name,
        candidate.topSkill,
        candidate.careerGoal,
        ...(candidate.searchableSkills ?? []),
        ...(candidate.verifiedSkills ?? []),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    }).sort((left, right) => sort === "name"
      ? left.name.localeCompare(right.name)
      : Date.parse(right.sharedAt ?? "") - Date.parse(left.sharedAt ?? ""));
  }, [candidates, statFilter, query, skill, sort]);

  const skills = useMemo(() => {
    const values = new Set<string>();
    for (const candidate of candidates) {
      for (const item of [...(candidate.verifiedSkills ?? []), ...(candidate.searchableSkills ?? [])]) {
        const trimmed = item.trim().toLowerCase();
        if (trimmed) values.add(trimmed);
      }
    }
    return [...values].sort();
  }, [candidates]);
  const pageSize = 9;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = visible.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    let active = true;
    listInterviewsApi()
      .then((rows) => {
        if (active) setInterviews(rows);
      })
      .catch(() => {
        if (active) setInterviews([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <RecruiterWorkspaceShell>
        <PageSkeleton rows={4} />
      </RecruiterWorkspaceShell>
    );
  }

  return (
    <RecruiterWorkspaceShell>
      <div className="space-y-6 pb-8">
        <section id="recruiter-directory" className="learner-stat-card min-w-0 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#023E8A]">Learner Directory</h2>
              <p className="text-xs text-[#64748b]">
                Shared profiles · {visible.length} {visible.length === 1 ? "learner" : "learners"}
              </p>
            </div>
            <div className="flex items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-1">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                  layout === "grid"
                    ? "bg-white text-[#023E8A] shadow-sm"
                    : "text-[#94a3b8] hover:text-[#023E8A]",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                  layout === "list"
                    ? "bg-white text-[#023E8A] shadow-sm"
                    : "text-[#94a3b8] hover:text-[#023E8A]",
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="Search name or skill"
                className="h-10 w-full rounded-xl border border-[#e2e8f0] bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]",
                      statFilter !== "all"
                        ? "border-[#023E8A]/40 text-[#023E8A]"
                        : "border-[#e2e8f0] text-[#334155]",
                    )}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {statFilter === "verified" ? "Verified" : statFilter === "credentials" ? "Credentials" : "All"}
                    <ChevronDown className="h-3.5 w-3.5 text-[#94a3b8]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuRadioGroup
                    value={statFilter === "verified" || statFilter === "credentials" ? statFilter : "all"}
                    onValueChange={(value) => setStatFilter(value as RecruiterStatFilter)}
                  >
                    <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="verified">Verified</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="credentials">With credentials</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 text-xs text-[#334155]">
                Skill
                <select
                  className="bg-transparent text-xs font-medium text-[#023E8A] outline-none"
                  value={skill}
                  onChange={(event) => { setSkill(event.target.value); setPage(1); }}
                >
                  <option value="all">All</option>
                  {skills.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 text-xs text-[#334155]">
                Sort
                <select
                  className="bg-transparent text-xs font-medium text-[#023E8A] outline-none"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as "recent" | "name")}
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          </div>

          <div className={layout === "grid" ? "mt-4 grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3" : "mt-4 space-y-3"}>
            {error && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={Users}
                  title="Could not load learners"
                  description={error}
                  action={{ label: "Try again", onClick: () => void refresh() }}
                />
              </div>
            )}
            {!error && visible.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={Users}
                  title={candidates.length === 0 ? "No learners yet" : "No matches"}
                  description={candidates.length === 0
                    ? "Learners appear here after they share with your account or with all SIJIL recruiters. A public link does not add them."
                    : "Try another filter or search."}
                  action={candidates.length > 0
                    ? { label: "Clear filters", onClick: () => { setStatFilter("all"); setQuery(""); } }
                    : undefined}
                />
              </div>
            )}
            {pageItems.map((learner) => (
              <RecruiterCandidateCard
                key={learner.id}
                candidate={learner}
                embedded
                onOpenSummary={() => navigate(`/recruiter/candidate/${learner.id}`)}
              />
            ))}
          </div>
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between text-xs text-[#334155]">
              <span>Page {safePage} of {pageCount}</span>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border px-3 py-1" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</button>
                <button type="button" className="rounded-lg border px-3 py-1" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
              </div>
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <RecruiterUpcomingInterviews
            interviews={interviews}
            onOpen={(id) => navigate(`/recruiter/candidate/${id}`)}
          />
          <RecruiterRecentActivity candidates={candidates} interviews={interviews} />
        </div>
      </div>
    </RecruiterWorkspaceShell>
  );
}

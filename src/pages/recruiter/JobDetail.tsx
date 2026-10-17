import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, CalendarClock, GitCompare, Search, UserCheck, UserX } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCandidates } from "@/hooks/useCandidates";
import { toast } from "@/hooks/use-toast";
import {
  jobsUseBrowserStorage,
  listRecruiterJobs,
  matchesForJob,
  setRecruiterJobDecision,
  setRecruiterJobStatus,
  type JobDecision,
  type RecruiterJob,
} from "@/lib/recruiter-jobs";
import { cn } from "@/lib/utils";

type StageFilter = "all" | JobDecision | "new";

const STAGES: { id: StageFilter; label: string }[] = [
  { id: "all", label: "All matches" },
  { id: "new", label: "Not decided" },
  { id: "interview", label: "Interview" },
  { id: "hired", label: "Hired" },
  { id: "rejected", label: "Rejected" },
];

function campusName(value: string | null | undefined) {
  const name = value?.trim();
  if (!name || name === "—") return null;
  return name;
}

function stageLabel(decision: JobDecision | undefined) {
  if (decision === "hired") return "Hired";
  if (decision === "rejected") return "Rejected";
  if (decision === "interview") return "Interview";
  return "Not decided";
}

function stageVariant(decision: JobDecision | undefined) {
  if (decision === "hired") return "verified" as const;
  if (decision === "rejected") return "destructive" as const;
  if (decision === "interview") return "info" as const;
  return "neutral" as const;
}

export default function RecruiterJobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { candidates } = useCandidates();
  const [job, setJob] = useState<RecruiterJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [stage, setStage] = useState<StageFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!user || !jobId) return;
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const rows = await listRecruiterJobs(user.id);
      const found = rows.find((row) => row.id === jobId) ?? null;
      setJob(found);
      setMissing(!found);
    } catch (err) {
      setJob(null);
      setError(err instanceof Error ? err.message : "Could not load this job.");
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(() => (job ? matchesForJob(job, candidates) : []), [candidates, job]);

  const counts = useMemo(() => ({
    all: matches.length,
    new: matches.filter((row) => !job?.decisions[row.candidate.id]).length,
    interview: matches.filter((row) => job?.decisions[row.candidate.id] === "interview").length,
    hired: matches.filter((row) => job?.decisions[row.candidate.id] === "hired").length,
    rejected: matches.filter((row) => job?.decisions[row.candidate.id] === "rejected").length,
  }), [job, matches]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matches.filter((row) => {
      const decision = job?.decisions[row.candidate.id];
      if (stage === "new" && decision) return false;
      if (stage !== "all" && stage !== "new" && decision !== stage) return false;
      if (!needle) return true;
      const campus = campusName(row.candidate.institution) ?? "";
      return `${row.candidate.name} ${campus} ${row.hits.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [job, matches, query, stage]);

  const decide = async (candidateId: string, decision: JobDecision) => {
    if (!user || !job || job.status === "closed") return;
    const next = job.decisions[candidateId] === decision ? null : decision;
    setBusyId(candidateId);
    try {
      const updated = await setRecruiterJobDecision(user.id, job, candidateId, next);
      setJob(updated);
    } catch (err) {
      toast({
        title: "Could not save the decision",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async () => {
    if (!user || !job) return;
    setBusyId("status");
    try {
      const updated = await setRecruiterJobStatus(user.id, job, job.status === "open" ? "closed" : "open");
      setJob(updated);
      toast({ title: updated.status === "open" ? "Job reopened" : "Job closed" });
    } catch (err) {
      toast({
        title: "Could not update the job",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  return (
    <AppShell role="recruiter">
      <div className="mb-5">
        <button
          type="button"
          onClick={() => navigate("/recruiter/jobs")}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[#64748b] hover:text-[#023E8A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Jobs
        </button>
        {job ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#023E8A] sm:text-3xl">{job.title}</h1>
                <p className="mt-1 text-sm text-[#64748b]">
                  {job.seats} {job.seats === 1 ? "seat" : "seats"}
                  {" · "}
                  {counts.hired} hired
                  {jobsUseBrowserStorage() ? " · saved in this browser" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-[#e8eef7] px-2.5 py-0.5 text-xs font-medium text-[#023E8A]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={busyId === "status"}
                onClick={() => void toggleStatus()}
              >
                {job.status === "open" ? "Close job" : "Reopen job"}
              </Button>
            </div>
          </>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight text-[#023E8A]">Job</h1>
        )}
      </div>

      {loading ? <PageSkeleton /> : error || missing || !job ? (
        <EmptyState
          icon={Briefcase}
          title={error ? "Could not load this job" : "Job not found"}
          description={error ?? "It may have been removed from this account."}
          action={{ label: "Back to jobs", onClick: () => navigate("/recruiter/jobs") }}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Matches", value: counts.all, hint: "Shared skills overlap" },
              { label: "Interview", value: counts.interview, hint: "Marked to interview" },
              { label: "Hired", value: counts.hired, hint: `${counts.hired} of ${job.seats} seats` },
              { label: "Rejected", value: counts.rejected, hint: "Not moving forward" },
            ].map((item) => (
              <div key={item.label} className="learner-stat-card p-5">
                <p className="text-2xl font-bold text-[#023E8A]">{item.value}</p>
                <p className="text-sm font-medium text-[#334155]">{item.label}</p>
                <p className="mt-0.5 text-xs text-[#64748b]">{item.hint}</p>
              </div>
            ))}
          </div>

          <section className="learner-stat-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                  Candidates
                  <span className="rounded-full bg-[#e8eef7] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#023E8A]">
                    {visible.length}
                  </span>
                </h2>
                <p className="text-xs text-[#64748b]">Pick up to four to compare, or schedule the interview from here.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name or skill"
                    className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button
                  className="h-10 rounded-xl bg-[#023E8A] text-white hover:bg-[#023E8A]/90"
                  disabled={selected.length < 2}
                  onClick={() => navigate(`/recruiter/compare?ids=${selected.join(",")}`)}
                >
                  <GitCompare className="mr-1.5 h-4 w-4" />
                  Compare {selected.length >= 2 ? selected.length : ""}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {STAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={stage === item.id}
                  onClick={() => setStage(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    stage === item.id ? "bg-[#023E8A] text-white" : "bg-[#f1f5f9] text-[#64748b] hover:text-[#023E8A]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              {visible.length === 0 ? (
                <EmptyState
                  icon={UserCheck}
                  title={matches.length === 0 ? "No candidates match yet" : "No matches"}
                  description={
                    matches.length === 0
                      ? "Matching uses skills already shared with recruiters. A broader skill on the job will widen this list."
                      : "Try another stage or search."
                  }
                />
              ) : (
                <div className="grid gap-3">
                  {visible.map((row) => {
                    const decision = job.decisions[row.candidate.id];
                    const campus = campusName(row.candidate.institution);
                    const checked = selected.includes(row.candidate.id);
                    const closed = job.status === "closed";
                    return (
                      <article key={row.candidate.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 flex-1 gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={`Select ${row.candidate.name}`}
                              onChange={() => toggleSelected(row.candidate.id)}
                              className="mt-1 h-4 w-4 accent-[#023E8A]"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/recruiter/candidate/${row.candidate.id}`}
                                  className="text-base font-semibold text-[#023E8A] hover:underline"
                                >
                                  {row.candidate.name}
                                </Link>
                                {campus ? <span className="text-xs text-[#64748b]">{campus}</span> : null}
                                <StatusBadge variant={stageVariant(decision)}>{stageLabel(decision)}</StatusBadge>
                              </div>
                              <p className="mt-1 text-xs text-[#64748b]">
                                Matches {row.hits.join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="rounded-xl" asChild>
                              <Link to={`/recruiter/candidate/${row.candidate.id}`}>View</Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => setScheduleFor({ id: row.candidate.id, name: row.candidate.name })}
                            >
                              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                              Schedule
                            </Button>
                            <Button
                              size="sm"
                              variant={decision === "interview" ? "default" : "outline"}
                              className={cn("rounded-xl", decision === "interview" && "bg-[#023E8A] text-white hover:bg-[#023E8A]/90")}
                              disabled={closed || busyId === row.candidate.id}
                              onClick={() => void decide(row.candidate.id, "interview")}
                            >
                              Interview
                            </Button>
                            <Button
                              size="sm"
                              variant={decision === "hired" ? "default" : "outline"}
                              className={cn("rounded-xl", decision === "hired" && "bg-[#059669] text-white hover:bg-[#059669]/90")}
                              disabled={closed || busyId === row.candidate.id}
                              onClick={() => void decide(row.candidate.id, "hired")}
                            >
                              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                              Hire
                            </Button>
                            <Button
                              size="sm"
                              variant={decision === "rejected" ? "destructive" : "outline"}
                              className="rounded-xl"
                              disabled={closed || busyId === row.candidate.id}
                              onClick={() => void decide(row.candidate.id, "rejected")}
                            >
                              <UserX className="mr-1.5 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {scheduleFor ? (
        <ScheduleInterviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setScheduleFor(null);
          }}
          candidateId={scheduleFor.id}
          candidateName={scheduleFor.name}
          onScheduled={() => {
            if (user && job && job.status === "open" && !job.decisions[scheduleFor.id]) {
              void setRecruiterJobDecision(user.id, job, scheduleFor.id, "interview").then(setJob).catch(() => undefined);
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Plus, Search, X } from "lucide-react";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useCandidates } from "@/hooks/useCandidates";
import { toast } from "@/hooks/use-toast";
import {
  createRecruiterJob,
  decisionCounts,
  listRecruiterJobs,
  matchesForJob,
  parseSkillList,
  type RecruiterJob,
} from "@/lib/recruiter-jobs";

type FilterId = "all" | "open" | "closed" | "interview" | "hired";

export default function RecruiterJobs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { candidates } = useCandidates();
  const [jobs, setJobs] = useState<RecruiterJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("open");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [seats, setSeats] = useState("1");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listRecruiterJobs(user.id);
      setJobs(rows);
    } catch (err) {
      setJobs([]);
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const suggestions = useMemo(() => {
    const selected = new Set(skills.map((skill) => skill.toLowerCase()));
    const names = new Set<string>();
    for (const candidate of candidates) {
      for (const skill of [...(candidate.verifiedSkills ?? []), ...(candidate.searchableSkills ?? [])]) {
        const trimmed = skill.trim();
        if (trimmed && trimmed !== "—" && !selected.has(trimmed.toLowerCase())) names.add(trimmed);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b)).slice(0, 16);
  }, [candidates, skills]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const decisions = decisionCounts(job);
      if (filter === "open" && job.status !== "open") return false;
      if (filter === "closed" && job.status !== "closed") return false;
      if (filter === "interview" && decisions.interview === 0) return false;
      if (filter === "hired" && decisions.hired === 0) return false;
      if (!needle) return true;
      return `${job.title} ${job.skills.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [filter, jobs, query]);

  const addSkills = (value: string) => {
    const next = parseSkillList([...skills, ...parseSkillList(value)].join(", "));
    setSkills(next);
    setSkillDraft("");
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const nextSkills = parseSkillList([...skills, ...parseSkillList(skillDraft)].join(", "));
    setSaving(true);
    try {
      const job = await createRecruiterJob(user.id, {
        title,
        seats: Number(seats),
        skills: nextSkills,
      });
      setTitle("");
      setSeats("1");
      setSkills([]);
      setSkillDraft("");
      setFilter("open");
      toast({
        title: "Job opened",
        description: `${job.title} is live. All SIJIL learners can see this role and share matching competencies.`,
      });
      navigate(`/recruiter/jobs/${job.id}`);
    } catch (err) {
      toast({
        title: "Could not open the job",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecruiterWorkspaceShell>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#023E8A] sm:text-3xl">Jobs</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Open a seat, match shared skills, then interview, hire, or reject from that role.
        </p>
      </div>

      {loading ? <PageSkeleton /> : (
        <>
          <section className="learner-stat-card mb-4 p-5">
            <h2 className="text-base font-semibold text-[#023E8A]">Open a role</h2>
            <p className="text-xs text-[#64748b]">Title, seats, and the skills the person needs to already share.</p>
            <form onSubmit={(event) => void create(event)} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-xs font-medium text-[#334155]">Job title</span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Frontend engineer"
                    maxLength={120}
                    className="h-10 rounded-xl"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#334155]">Seats</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                    className="h-10 rounded-xl"
                  />
                </label>
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-10 rounded-xl bg-[#023E8A] px-4 text-white hover:bg-[#023E8A]/90"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {saving ? "Opening…" : "Open job"}
                </Button>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#334155]">Required skills</span>
                <div className="flex gap-2">
                  <Input
                    value={skillDraft}
                    onChange={(event) => setSkillDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (skillDraft.trim()) addSkills(skillDraft);
                    }}
                    placeholder="React, TypeScript"
                    className="h-10 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => skillDraft.trim() && addSkills(skillDraft)}
                  >
                    Add
                  </Button>
                </div>
                {skills.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => setSkills((current) => current.filter((item) => item !== skill))}
                        className="inline-flex items-center gap-1 rounded-full bg-[#e8eef7] px-2.5 py-1 text-xs font-medium text-[#023E8A]"
                      >
                        {skill}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {suggestions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestions.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => addSkills(skill)}
                        className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs text-[#64748b] hover:text-[#023E8A]"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </form>
          </section>

          <section className="learner-stat-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                  Roles
                  <span className="rounded-full bg-[#e8eef7] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#023E8A]">
                    {visible.length}
                  </span>
                </h2>
                <p className="text-xs text-[#64748b]">Open a role to see who matches and record the hire.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <Select value={filter} onValueChange={(value) => setFilter(value as FilterId)}>
                  <SelectTrigger className="h-10 w-full rounded-xl sm:w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="interview">In interview</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative min-w-0 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title or skill"
                    className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5">
              {error ? (
                <EmptyState
                  icon={Briefcase}
                  title="Could not load jobs"
                  description={error}
                  action={{ label: "Try again", onClick: () => void load() }}
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title={jobs.length === 0 ? "No jobs yet" : "No matches"}
                  description={
                    jobs.length === 0
                      ? "Open a role above. Matching uses skills learners have already shared."
                      : "Try another status or search."
                  }
                  action={jobs.length > 0
                    ? { label: "Show open roles", onClick: () => { setFilter("open"); setQuery(""); } }
                    : undefined}
                />
              ) : (
                <div className="grid gap-3">
                  {visible.map((job) => {
                    const decisions = decisionCounts(job);
                    const matches = matchesForJob(job, candidates).length;
                    return (
                      <article key={job.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <button
                            type="button"
                            onClick={() => navigate(`/recruiter/jobs/${job.id}`)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold text-[#023E8A]">{job.title}</span>
                              <StatusBadge variant={job.status === "open" ? "verified" : "neutral"}>
                                {job.status === "open" ? "Open" : "Closed"}
                              </StatusBadge>
                            </span>
                            <span className="mt-1 block text-xs text-[#64748b]">
                              {job.seats} {job.seats === 1 ? "seat" : "seats"}
                              {" · "}
                              {matches} {matches === 1 ? "match" : "matches"}
                              {decisions.hired > 0 ? ` · ${decisions.hired} hired` : ""}
                              {decisions.interview > 0 ? ` · ${decisions.interview} in interview` : ""}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              {job.skills.map((skill) => (
                                <span key={skill} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs text-[#334155]">
                                  {skill}
                                </span>
                              ))}
                            </span>
                          </button>
                          <Button
                            size="sm"
                            className="rounded-xl bg-[#023E8A] text-white hover:bg-[#023E8A]/90"
                            onClick={() => navigate(`/recruiter/jobs/${job.id}`)}
                          >
                            Open
                          </Button>
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
    </RecruiterWorkspaceShell>
  );
}

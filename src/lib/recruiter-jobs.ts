import { supabase } from "@/integrations/supabase/client";
import type { CandidateView } from "@/lib/db/candidates";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { formatSupabaseError } from "@/lib/utils";

export type JobDecision = "interview" | "hired" | "rejected";
export type JobStatus = "open" | "closed";

export type RecruiterJob = {
  id: string;
  title: string;
  seats: number;
  skills: string[];
  status: JobStatus;
  decisions: Record<string, JobDecision>;
  createdAt: string;
};

export type JobMatch = {
  candidate: CandidateView;
  hits: string[];
};

const TABLE = "recruiter_jobs";
let browserOnly = false;

function storageKey(userId: string) {
  return `sijil.recruiterJobs.${userId}`;
}

function normalizeSkill(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, "");
}

export function parseSkillList(value: string) {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const skill = part.trim().replace(/\s+/g, " ");
    const key = normalizeSkill(skill);
    if (!skill || !key || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  return skills.slice(0, 12);
}

export function candidateSkillNames(candidate: CandidateView) {
  return [...new Set([
    ...(candidate.verifiedSkills ?? []),
    ...(candidate.searchableSkills ?? []),
    candidate.topSkill,
  ].map((skill) => skill?.trim()).filter((skill): skill is string => Boolean(skill && skill !== "—")))];
}

export function matchJobSkills(required: string[], candidate: CandidateView) {
  const have = candidateSkillNames(candidate);
  return required.filter((skill) => {
    const needle = normalizeSkill(skill);
    if (!needle) return false;
    return have.some((name) => {
      const hay = normalizeSkill(name);
      if (!hay) return false;
      return hay === needle || hay.includes(needle) || needle.includes(hay);
    });
  });
}

export function matchesForJob(job: RecruiterJob, candidates: CandidateView[]): JobMatch[] {
  if (job.skills.length === 0) return [];
  return candidates
    .map((candidate) => ({ candidate, hits: matchJobSkills(job.skills, candidate) }))
    .filter((row) => row.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.candidate.name.localeCompare(b.candidate.name));
}

export function decisionCounts(job: RecruiterJob) {
  const values = Object.values(job.decisions);
  return {
    interview: values.filter((value) => value === "interview").length,
    hired: values.filter((value) => value === "hired").length,
    rejected: values.filter((value) => value === "rejected").length,
  };
}

function readBrowser(userId: string): RecruiterJob[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecruiterJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBrowser(userId: string, jobs: RecruiterJob[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(jobs));
}

function asSkills(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asDecisions(value: unknown): Record<string, JobDecision> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const decisions: Record<string, JobDecision> = {};
  for (const [key, decision] of Object.entries(value)) {
    if (decision === "interview" || decision === "hired" || decision === "rejected") {
      decisions[key] = decision;
    }
  }
  return decisions;
}

function mapRow(row: Record<string, unknown>): RecruiterJob {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    seats: Number(row.seats) || 1,
    skills: asSkills(row.skills),
    status: row.status === "closed" ? "closed" : "open",
    decisions: asDecisions(row.decisions),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function jobsUseBrowserStorage() {
  return browserOnly;
}

export async function listRecruiterJobs(userId: string) {
  if (browserOnly) return readBrowser(userId);
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, title, seats, skills, status, decisions, created_at")
    .eq("recruiter_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error)) {
      browserOnly = true;
      return readBrowser(userId);
    }
    throw new Error(formatSupabaseError(error));
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function createRecruiterJob(
  userId: string,
  input: { title: string; seats: number; skills: string[] },
) {
  const title = input.title.trim().replace(/\s+/g, " ");
  const skills = parseSkillList(input.skills.join(", "));
  const seats = Math.min(50, Math.max(1, Math.round(input.seats) || 1));
  if (title.length < 2) throw new Error("Add a job title.");
  if (skills.length === 0) throw new Error("Add at least one required skill.");

  if (browserOnly) {
    const job: RecruiterJob = {
      id: crypto.randomUUID(),
      title,
      seats,
      skills,
      status: "open",
      decisions: {},
      createdAt: new Date().toISOString(),
    };
    writeBrowser(userId, [job, ...readBrowser(userId)]);
    return job;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      recruiter_user_id: userId,
      title,
      seats,
      skills,
      status: "open",
      decisions: {},
    })
    .select("id, title, seats, skills, status, decisions, created_at")
    .single();
  if (error) {
    if (isMissingRelationError(error)) {
      browserOnly = true;
      return createRecruiterJob(userId, input);
    }
    throw new Error(formatSupabaseError(error));
  }
  return mapRow(data as Record<string, unknown>);
}

async function replaceJob(userId: string, job: RecruiterJob) {
  if (browserOnly) {
    const next = readBrowser(userId).map((row) => (row.id === job.id ? job : row));
    writeBrowser(userId, next);
    return job;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      title: job.title,
      seats: job.seats,
      skills: job.skills,
      status: job.status,
      decisions: job.decisions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("recruiter_user_id", userId)
    .select("id, title, seats, skills, status, decisions, created_at")
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  return mapRow(data as Record<string, unknown>);
}

export async function setRecruiterJobStatus(userId: string, job: RecruiterJob, status: JobStatus) {
  return replaceJob(userId, { ...job, status });
}

export async function setRecruiterJobDecision(
  userId: string,
  job: RecruiterJob,
  candidateId: string,
  decision: JobDecision | null,
) {
  const decisions = { ...job.decisions };
  if (decision) decisions[candidateId] = decision;
  else delete decisions[candidateId];
  return replaceJob(userId, { ...job, decisions });
}

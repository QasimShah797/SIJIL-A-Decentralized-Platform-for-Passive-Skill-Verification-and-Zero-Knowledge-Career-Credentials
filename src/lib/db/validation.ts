import { supabase } from "@/integrations/supabase/client";
import type { DeclaredSkill } from "@/lib/sijil-data";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import { fetchAttempt } from "@/lib/db/practical-attempts";

export type ValidationSummary = {
  skill: string;
  result: string;
  status: string;
  evaluatedOn: string;
  sources: string[];
  reviewCount: number;
  supportingRecords: number;
  latestActivity: string;
  task: string;
  rows: { name: string; type: string; date: string; role: string }[];
};

export async function buildValidationSummary(
  userId: string,
  skill: DeclaredSkill,
): Promise<ValidationSummary> {
  const [ghActs, lmsEv, ghRepos, reviews, attempt] = await Promise.all([
    supabase
      .from("github_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("lms_evidence")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .order("fetched_at", { ascending: false })
      .limit(20),
    supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .eq("linked_skill_id", skill.id)
      .limit(10),
    fetchPeerReviews(userId),
    fetchAttempt(userId, skill.id),
  ]);

  const skillReviews = reviews.filter((r) => r.skill === skill.name);
  const rows: ValidationSummary["rows"] = [];

  for (const e of lmsEv.data ?? []) {
    rows.push({
      name: e.course_name,
      type: "LMS",
      date: new Date(e.fetched_at).toLocaleDateString(),
      role: "Primary evidence",
    });
  }
  for (const a of ghActs.data ?? []) {
    rows.push({
      name: a.activity_title,
      type: "GitHub",
      date: a.occurred_at ? new Date(a.occurred_at).toLocaleDateString() : "—",
      role: "Code contribution",
    });
  }
  for (const r of ghRepos.data ?? []) {
    rows.push({
      name: r.repo_name,
      type: "GitHub",
      date: r.last_updated ? new Date(r.last_updated).toLocaleDateString() : "—",
      role: "Repository",
    });
  }
  if (attempt) {
    rows.push({
      name: `Practical attempt ${attempt.attemptId}`,
      type: "Practical Submission",
      date: new Date(attempt.startedAt).toLocaleDateString(),
      role: "Hands-on artifact",
    });
  }
  for (const r of skillReviews) {
    rows.push({
      name: `${r.reviewerName} — ${r.reviewerRole}`,
      type: "Review",
      date: new Date(r.date).toLocaleDateString(),
      role: "Peer review",
    });
  }

  const sources = [...new Set(rows.map((r) => r.type))];
  const supportingRecords = rows.length;
  const hasEvidence = supportingRecords > 0;

  const dates = rows
    .map((r) => r.date)
    .filter((d) => d !== "—")
    .sort()
    .reverse();

  return {
    skill: skill.name,
    result: hasEvidence ? "Passed" : "Pending",
    status: hasEvidence ? "Validated" : "Under Review",
    evaluatedOn: dates[0] ?? "—",
    sources: sources.length ? sources : ["No evidence yet"],
    reviewCount: skillReviews.length,
    supportingRecords,
    latestActivity: dates[0] ?? "—",
    task: attempt ? `Attempt ${attempt.attemptId}` : "No task submitted",
    rows,
  };
}

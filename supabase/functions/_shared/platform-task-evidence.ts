import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import type { RepoRef } from "./github-task-pipeline.ts";

type QueryRow = Record<string, unknown>;

const SKILL_LANGUAGE_ALIASES: Record<string, string[]> = {
  postgresql: ["sql", "postgres", "plpgsql"],
  postgres: ["sql", "postgresql", "plpgsql"],
  sql: ["postgresql", "postgres", "plpgsql", "mysql"],
  mysql: ["sql"],
  react: ["javascript", "typescript", "jsx", "tsx"],
  "react.js": ["javascript", "typescript", "react", "jsx"],
  reactjs: ["javascript", "typescript", "react"],
  node: ["javascript", "typescript"],
  "node.js": ["javascript", "typescript"],
  express: ["javascript", "typescript", "node"],
  vue: ["javascript", "typescript"],
  angular: ["javascript", "typescript"],
  typescript: ["javascript"],
  javascript: ["typescript"],
  python: ["django", "flask"],
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value: unknown): string {
  return textValue(value).toLowerCase();
}

export function matchesCompetencyName(value: unknown, competencyName: string): boolean {
  const left = normalizedText(value);
  const right = normalizedText(competencyName);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;

  const aliases = SKILL_LANGUAGE_ALIASES[right] ?? [];
  return aliases.some((alias) => left === alias || left.includes(alias) || alias.includes(left));
}

function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetencyName(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as QueryRow;
      return matchesCompetencyName(row.name, competencyName)
        || matchesCompetencyName(row.shortname, competencyName)
        || matchesCompetencyName(row.label, competencyName);
    }
    return false;
  });
}

async function safeFetchArray(
  label: string,
  run: () => Promise<{ data: QueryRow[] | null; error: { message: string } | null }>,
): Promise<QueryRow[]> {
  const { data, error } = await run();
  if (error) {
    console.error(`${label} query failed:`, error.message);
    return [];
  }
  return data ?? [];
}

async function safeFetchSingle(
  label: string,
  run: () => Promise<{ data: QueryRow | null; error: { message: string } | null }>,
): Promise<QueryRow | null> {
  const { data, error } = await run();
  if (error) {
    console.error(`${label} query failed:`, error.message);
    return null;
  }
  return data ?? null;
}

export type PlatformTaskEvidence = {
  githubRepos: RepoRef[];
  promptBlock: string;
  sources: {
    github: string[];
    lms: string[];
    moodle: string[];
    uploads: string[];
    linkedin: string | null;
  };
};

export async function collectPlatformEvidenceForTask(
  admin: SupabaseClient,
  userId: string,
  skillId: string | undefined,
  competencyName: string,
): Promise<PlatformTaskEvidence> {
  const [
    githubReposRaw,
    githubActivitiesRaw,
    evidenceRecordsRaw,
    lmsEvidenceRaw,
    moodleAssignmentsRaw,
    moodleCoursesRaw,
    moodleGradesRaw,
    supportingRaw,
    linkedinRow,
    learnerProfile,
  ] = await Promise.all([
    safeFetchArray("github_repos task evidence", () =>
      admin
        .from("github_repos")
        .select("id, repo_name, full_name, github_url, primary_language, description, commit_count, linked_skill_id, linked_skill_name, last_updated")
        .eq("user_id", userId),
    ),
    safeFetchArray("github_activities task evidence", () =>
      admin
        .from("github_activities")
        .select("activity_type, activity_title, repo_name, linked_skill_id, occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(40),
    ),
    safeFetchArray("evidence_records task evidence", () =>
      admin
        .from("evidence_records")
        .select("source, repository_name, language, description, mapped_skill_id, suggested_skill_id, suggested_skill_name")
        .eq("user_id", userId),
    ),
    safeFetchArray("lms_evidence task evidence", () =>
      admin
        .from("lms_evidence")
        .select("title, source, course_name, course_code, grade, completion_status, text_preview, linked_skill_id")
        .eq("user_id", userId),
    ),
    safeFetchArray("moodle_assignments task evidence", () =>
      admin
        .from("moodle_assignments")
        .select("name, competency_tags, grade, grade_formatted, submission_status")
        .eq("user_id", userId),
    ),
    safeFetchArray("moodle_courses task evidence", () =>
      admin
        .from("moodle_courses")
        .select("fullname, shortname")
        .eq("user_id", userId),
    ),
    safeFetchArray("moodle_grades task evidence", () =>
      admin
        .from("moodle_grades")
        .select("item_name, item_type, grade, grade_formatted")
        .eq("user_id", userId),
    ),
    safeFetchArray("supporting_records task evidence", () =>
      admin
        .from("supporting_records")
        .select("title, source, skill_id")
        .eq("user_id", userId),
    ),
    safeFetchSingle("linkedin_connections task evidence", () =>
      admin
        .from("linkedin_connections")
        .select("display_name, profile_url, verified_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ),
    safeFetchSingle("learner_profiles task evidence", () =>
      admin
        .from("learner_profiles")
        .select("linkedin_url")
        .eq("user_id", userId)
        .maybeSingle(),
    ),
  ]);

  const githubRepos = githubReposRaw.filter((row) =>
    (skillId && textValue(row.linked_skill_id) === skillId)
    || matchesCompetencyName(row.linked_skill_name, competencyName)
    || matchesCompetencyName(row.repo_name, competencyName)
    || matchesCompetencyName(row.full_name, competencyName)
    || matchesCompetencyName(row.primary_language, competencyName)
    || matchesCompetencyName(row.description, competencyName),
  );

  const githubRepoNames = new Set(
    githubRepos.flatMap((row) => [
      normalizedText(row.full_name),
      normalizedText(row.repo_name),
    ]).filter(Boolean),
  );

  const githubActivities = githubActivitiesRaw.filter((row) => {
    const repoName = normalizedText(row.repo_name);
    return (skillId && textValue(row.linked_skill_id) === skillId)
      || githubRepoNames.has(repoName)
      || matchesCompetencyName(row.repo_name, competencyName)
      || matchesCompetencyName(row.activity_title, competencyName);
  });

  const evidenceRecords = evidenceRecordsRaw.filter((row) =>
    (skillId && (textValue(row.mapped_skill_id) === skillId || textValue(row.suggested_skill_id) === skillId))
    || matchesCompetencyName(row.suggested_skill_name, competencyName)
    || matchesCompetencyName(row.repository_name, competencyName)
    || matchesCompetencyName(row.language, competencyName)
    || matchesCompetencyName(row.description, competencyName),
  );

  const lmsEvidence = lmsEvidenceRaw.filter((row) =>
    (skillId && textValue(row.linked_skill_id) === skillId)
    || matchesCompetencyName(row.course_name, competencyName)
    || matchesCompetencyName(row.course_code, competencyName)
    || matchesCompetencyName(row.title, competencyName)
    || matchesCompetencyName(row.text_preview, competencyName),
  );

  const moodleAssignments = moodleAssignmentsRaw.filter((row) =>
    matchesCompetencyTags(row.competency_tags, competencyName)
    || matchesCompetencyName(row.name, competencyName),
  );

  const moodleCourses = moodleCoursesRaw.filter((row) =>
    matchesCompetencyName(row.fullname, competencyName)
    || matchesCompetencyName(row.shortname, competencyName),
  );

  const moodleGrades = moodleGradesRaw.filter((row) =>
    matchesCompetencyName(row.item_name, competencyName),
  );

  const uploads = supportingRaw.filter((row) =>
    (skillId && textValue(row.skill_id) === skillId)
    || matchesCompetencyName(row.title, competencyName),
  );

  const githubLines = [
    ...githubRepos.slice(0, 8).map((row) => {
      const name = textValue(row.full_name) || textValue(row.repo_name) || "GitHub repo";
      const language = textValue(row.primary_language);
      const commits = typeof row.commit_count === "number" ? `${row.commit_count} commits` : null;
      return [name, language, commits].filter(Boolean).join(" · ");
    }),
    ...githubActivities.slice(0, 6).map((row) =>
      `${textValue(row.activity_type) || "activity"}: ${textValue(row.activity_title) || textValue(row.repo_name)}`,
    ),
    ...evidenceRecords
      .filter((row) => normalizedText(row.source) !== "lms")
      .slice(0, 5)
      .map((row) =>
        `${textValue(row.source) || "Evidence"}: ${textValue(row.repository_name) || textValue(row.description) || "record"} (${textValue(row.language) || "unknown language"})`,
      ),
  ];

  const lmsLines = lmsEvidence.slice(0, 8).map((row) => {
    const title = textValue(row.title) || textValue(row.course_name) || "LMS item";
    const grade = textValue(row.grade);
    const status = textValue(row.completion_status);
    return [title, textValue(row.source) || "LMS", grade, status].filter(Boolean).join(" · ");
  });

  const moodleLines = [
    ...moodleCourses.slice(0, 5).map((row) =>
      `Course: ${textValue(row.fullname) || textValue(row.shortname)}`,
    ),
    ...moodleAssignments.slice(0, 6).map((row) => {
      const grade = textValue(row.grade_formatted) || (row.grade != null ? String(row.grade) : "");
      return [`Assignment: ${textValue(row.name)}`, grade, textValue(row.submission_status)].filter(Boolean).join(" · ");
    }),
    ...moodleGrades.slice(0, 5).map((row) =>
      `Grade: ${textValue(row.item_name)} · ${textValue(row.grade_formatted) || String(row.grade ?? "")}`,
    ),
  ];

  const uploadLines = uploads.slice(0, 6).map((row) =>
    `${textValue(row.source) || "Upload"}: ${textValue(row.title) || "supporting record"}`,
  );

  const linkedinName = textValue(linkedinRow?.display_name);
  const linkedinUrl = textValue(linkedinRow?.profile_url) || textValue(learnerProfile?.linkedin_url);
  const linkedin = linkedinName || linkedinUrl
    ? [linkedinName || "LinkedIn profile connected", linkedinUrl, linkedinRow?.verified_at ? "verified" : null]
      .filter(Boolean)
      .join(" · ")
    : null;

  const sections = [
    `Declared competency name: ${competencyName}`,
    githubLines.length
      ? `GitHub evidence:\n${githubLines.map((line) => `- ${line}`).join("\n")}`
      : "GitHub evidence: none linked to this competency name",
    lmsLines.length
      ? `LMS evidence:\n${lmsLines.map((line) => `- ${line}`).join("\n")}`
      : "LMS evidence: none linked to this competency name",
    moodleLines.length
      ? `Moodle evidence:\n${moodleLines.map((line) => `- ${line}`).join("\n")}`
      : "Moodle evidence: none linked to this competency name",
    uploadLines.length
      ? `Uploaded records:\n${uploadLines.map((line) => `- ${line}`).join("\n")}`
      : "Uploaded records: none linked to this competency name",
    linkedin ? `LinkedIn: ${linkedin}` : "LinkedIn: not connected",
  ];

  return {
    githubRepos: githubRepos.map((row) => ({
      name: textValue(row.repo_name) || undefined,
      full_name: textValue(row.full_name) || undefined,
      github_url: textValue(row.github_url) || undefined,
      language: textValue(row.primary_language) || null,
    })),
    promptBlock: sections.join("\n\n"),
    sources: {
      github: githubLines,
      lms: lmsLines,
      moodle: moodleLines,
      uploads: uploadLines,
      linkedin,
    },
  };
}

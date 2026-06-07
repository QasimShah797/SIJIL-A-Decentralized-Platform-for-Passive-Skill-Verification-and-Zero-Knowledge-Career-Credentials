import { supabase } from "@/integrations/supabase/client";
import type { Project, ProjectContributor } from "@/lib/sijil-data";

export async function fetchProjectsFromDb(userId: string): Promise<Project[]> {
  const [{ data: repos }, { data: contributors }] = await Promise.all([
    supabase
      .from("github_repos")
      .select("*")
      .eq("user_id", userId)
      .order("last_updated", { ascending: false }),
    supabase
      .from("github_repo_contributors")
      .select("*")
      .eq("user_id", userId),
  ]);

  const contribsByRepo = new Map<number, ProjectContributor[]>();
  for (const c of contributors ?? []) {
    const list = contribsByRepo.get(c.repo_id as number) ?? [];
    list.push({
      id: c.id as string,
      name: c.full_name as string,
      handle: c.contributor_login as string,
      role: "Project Collaborator",
      avatarUrl: c.contributor_avatar_url as string | undefined,
    });
    contribsByRepo.set(c.repo_id as number, list);
  }

  const ghProjects: Project[] = (repos ?? []).map((r) => ({
    id: `gh-${r.repo_id}`,
    name: r.repo_name as string,
    source: "GitHub" as const,
    url: r.github_url as string,
    evidenceLabel: `GitHub repo: ${r.full_name}`,
    linkedSkills: r.linked_skill_name ? [r.linked_skill_name as string] : [],
    contributors: contribsByRepo.get(r.repo_id as number) ?? [],
  }));

  const { data: lmsEvidence } = await supabase
    .from("lms_evidence")
    .select("*")
    .eq("user_id", userId)
    .limit(20);

  const lmsProjects: Project[] = (lmsEvidence ?? []).map((e) => ({
    id: `lms-${e.id}`,
    name: e.course_name as string,
    source: "LMS" as const,
    evidenceLabel: `LMS: ${e.course_name}`,
    linkedSkills: e.linked_skill_id ? [e.linked_skill_id as string] : [],
    contributors: [],
  }));

  return [...ghProjects, ...lmsProjects];
}

/**
 * Real data loaders for the Peer Reviews page (replaces sijil-data mock/localStorage).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectsFromDb } from "@/lib/db/projects";
import { fetchLinkedProjectEvidence } from "@/lib/db/github-evidence";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import { fetchPeerReviews, fetchInvitations } from "@/lib/db/peer-reviews";
import type {
  PeerReview,
  Project,
  ProjectContributor,
  ReviewInvitation,
  ContributorReviewStatus,
} from "@/lib/sijil-data";

export type PeerReviewProject = Project & {
  evidenceRecordId?: string;
  skillLinks: { skillId: string; skillName: string }[];
};

export type ContextReviewRequestDisplay = {
  id: string;
  token: string;
  projectId: string;
  projectName: string;
  source: Project["source"];
  contributorId: string;
  contributorName: string;
  contributorEmail: string;
  contributorRole: string;
  skill: string;
  skillId: string | null;
  status: "Sent" | "Completed" | "Expired";
  sentAt: string;
  completedReviewId?: string;
};

export type ContributorRow = {
  contributor: ProjectContributor;
  project: PeerReviewProject;
  status: ContributorReviewStatus;
  lastInviteAt: string | null;
  invitationId?: string;
  reviewId?: string;
  reviewLink?: string;
};

function reviewMatchesContributor(
  review: PeerReview,
  project: PeerReviewProject,
  contributor: ProjectContributor,
): boolean {
  const nameMatch =
    review.reviewerName === contributor.handle
    || review.reviewerName === contributor.name
    || review.reviewerName === `@${contributor.handle}`;
  const projectMatch =
    review.projectId === project.id
    || review.projectName === project.name
    || review.evidenceLabel.toLowerCase().includes(project.name.toLowerCase());
  return nameMatch && projectMatch;
}

function reviewsForProject(project: PeerReviewProject, reviews: PeerReview[]): PeerReview[] {
  return reviews.filter(
    (r) => r.projectId === project.id
      || r.projectName === project.name
      || r.evidenceLabel.toLowerCase().includes(project.name.toLowerCase()),
  );
}

export function buildContributorRows(
  project: PeerReviewProject,
  reviews: PeerReview[],
  requests: ContextReviewRequestDisplay[],
  legacyInvitations: ReviewInvitation[],
): ContributorRow[] {
  return project.contributors.map((c) => {
    const review = reviews.find((r) => reviewMatchesContributor(r, project, c));
    const ctxRequest = requests.find(
      (r) => r.projectId === project.id
        && (r.contributorName === c.name || r.contributorName === c.handle),
    );
    const legacyInv = legacyInvitations.find(
      (i) => i.projectId === project.id && i.contributorId === c.id,
    );

    if (review?.imported) {
      return {
        contributor: c,
        project,
        status: "Imported Review Found",
        lastInviteAt: ctxRequest?.sentAt ?? legacyInv?.sentAt ?? null,
        reviewId: review.id,
        invitationId: ctxRequest?.id ?? legacyInv?.id,
      };
    }
    if (review) {
      return {
        contributor: c,
        project,
        status: "Review Received",
        lastInviteAt: ctxRequest?.sentAt ?? legacyInv?.sentAt ?? null,
        reviewId: review.id,
        invitationId: ctxRequest?.id ?? legacyInv?.id,
      };
    }
    if (ctxRequest && ctxRequest.status !== "Completed") {
      return {
        contributor: c,
        project,
        status: "Invite Sent",
        lastInviteAt: ctxRequest.sentAt,
        invitationId: ctxRequest.id,
        reviewLink: `${window.location.origin}/review/request/${ctxRequest.token}`,
      };
    }
    if (legacyInv && legacyInv.status !== "Completed") {
      return {
        contributor: c,
        project,
        status: "Invite Sent",
        lastInviteAt: legacyInv.sentAt,
        invitationId: legacyInv.id,
        reviewLink: `${window.location.origin}/review/${legacyInv.id}`,
      };
    }
    return {
      contributor: c,
      project,
      status: "Review Pending",
      lastInviteAt: null,
    };
  });
}

function mapReviewRequestRow(row: Record<string, unknown>): ContextReviewRequestDisplay {
  const evidence = row.evidence_records as {
    repository_name?: string;
    source?: Project["source"];
    github_repo_id?: number;
  } | null;
  const skill = row.declared_skills as { name?: string } | null;
  const repoId = evidence?.github_repo_id;
  const statusRaw = row.status as string;
  const status: ContextReviewRequestDisplay["status"] =
    statusRaw === "completed" ? "Completed"
      : statusRaw === "expired" ? "Expired"
        : "Sent";

  return {
    id: row.id as string,
    token: row.token as string,
    projectId: repoId ? `gh-${repoId}` : `ev-${row.evidence_record_id}`,
    projectName: evidence?.repository_name ?? "Project evidence",
    source: (evidence?.source as Project["source"]) ?? "GitHub",
    contributorId: (row.reviewer_context_id as string) ?? (row.reviewer_name as string),
    contributorName: row.reviewer_name as string,
    contributorEmail: row.reviewer_email as string,
    contributorRole: row.reviewer_context_role as string,
    skill: skill?.name ?? "Skill claim",
    skillId: (row.skill_id as string) ?? null,
    status,
    sentAt: row.created_at as string,
    completedReviewId: (row.completed_review_id as string) ?? undefined,
  };
}

async function fetchContributors(
  userId: string,
): Promise<Array<ProjectContributor & { repoId: number }>> {
  const { data, error } = await supabase
    .from("github_repo_contributors")
    .select("*")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.full_name as string,
    handle: c.contributor_login as string,
    role: "Project Collaborator" as const,
    avatarUrl: c.contributor_avatar_url as string | undefined,
    repoId: c.repo_id as number,
  }));
}

async function fetchEvidenceRecordProjects(userId: string): Promise<ProjectEvidenceApiView[]> {
  const { data, error } = await supabase
    .from("evidence_records")
    .select("id, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
    .eq("user_id", userId)
    .eq("source", "GitHub")
    .order("last_updated", { ascending: false, nullsFirst: false });

  if (error || !data?.length) return [];

  const { data: links } = await supabase
    .from("skill_evidence_links")
    .select("evidence_record_id, skill_id, match_reason, linked_at, declared_skills(name)")
    .eq("user_id", userId);

  const linksByEvidence = new Map<string, { skillId: string; skillName: string; matchReason: string | null; linkedAt: string }[]>();
  for (const link of links ?? []) {
    const evidenceId = link.evidence_record_id as string;
    const skillData = link.declared_skills as { name?: string } | null;
    const entry = {
      skillId: link.skill_id as string,
      skillName: skillData?.name ?? "",
      matchReason: (link.match_reason as string | null) ?? null,
      linkedAt: link.linked_at as string,
    };
    const list = linksByEvidence.get(evidenceId) ?? [];
    list.push(entry);
    linksByEvidence.set(evidenceId, list);
  }

  return data.map((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    const repoFullName = (row.repo_full_name as string | null)
      ?? (metadata?.full_name as string | undefined)
      ?? (row.repository_name as string);
    const githubRepoId = Number(row.github_repo_id ?? 0);
    return {
      repoId: row.id as string,
      githubRepoId,
      repositoryName: row.repository_name as string,
      repoFullName,
      repositoryUrl: row.repository_url as string,
      description: null,
      primaryLanguage: null,
      languageBreakdown: {},
      topics: [],
      lastUpdated: null,
      commitCount: null,
      evidenceRecordId: row.id as string,
      skillLinks: linksByEvidence.get(row.id as string) ?? [],
    };
  });
}

function attachContributors(
  projects: PeerReviewProject[],
  contributors: Array<ProjectContributor & { repoId?: number }>,
): PeerReviewProject[] {
  const byRepoId = new Map<number, ProjectContributor[]>();
  for (const c of contributors) {
    if (c.repoId == null) continue;
    const { repoId, ...contrib } = c;
    const list = byRepoId.get(repoId) ?? [];
    list.push(contrib);
    byRepoId.set(repoId, list);
  }

  return projects.map((p) => {
    const repoId = p.id.startsWith("gh-") ? Number(p.id.slice(3)) : null;
    const existing = p.contributors ?? [];
    const fromDb = repoId != null ? (byRepoId.get(repoId) ?? []) : [];
    return {
      ...p,
      contributors: existing.length ? existing : fromDb,
    };
  });
}

function buildPeerReviewProjects(
  dbProjects: Project[],
  linkedEvidence: ProjectEvidenceApiView[],
  evidenceProjects: ProjectEvidenceApiView[],
): PeerReviewProject[] {
  const linkedByRepoId = new Map<number, ProjectEvidenceApiView>();
  for (const e of linkedEvidence) linkedByRepoId.set(e.githubRepoId, e);
  for (const e of evidenceProjects) {
    if (e.githubRepoId && !linkedByRepoId.has(e.githubRepoId)) {
      linkedByRepoId.set(e.githubRepoId, e);
    }
  }

  if (dbProjects.length) {
    return dbProjects.map((p) => {
      const repoId = p.id.startsWith("gh-") ? Number(p.id.slice(3)) : null;
      const linked = repoId != null ? linkedByRepoId.get(repoId) : undefined;
      return {
        ...p,
        evidenceRecordId: linked?.evidenceRecordId,
        linkedSkills: linked?.skillLinks.map((s) => s.skillName) ?? p.linkedSkills,
        skillLinks: linked?.skillLinks ?? [],
      };
    });
  }

  const fromEvidence = [...linkedByRepoId.values()];
  if (!fromEvidence.length) return [];

  return fromEvidence.map((e) => ({
    id: e.githubRepoId ? `gh-${e.githubRepoId}` : `ev-${e.evidenceRecordId}`,
    name: e.repositoryName,
    source: "GitHub" as const,
    url: e.repositoryUrl,
    evidenceLabel: `GitHub repo: ${e.repoFullName}`,
    linkedSkills: e.skillLinks.map((s) => s.skillName),
    contributors: [],
    evidenceRecordId: e.evidenceRecordId,
    skillLinks: e.skillLinks,
  }));
}

async function safeLoad<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export function contextRequestToInvitation(req: ContextReviewRequestDisplay): ReviewInvitation {
  return {
    id: req.id,
    projectId: req.projectId,
    projectName: req.projectName,
    source: req.source,
    contributorId: req.contributorId,
    contributorName: req.contributorName,
    contributorEmail: req.contributorEmail,
    contributorRole: req.contributorRole as ReviewInvitation["contributorRole"],
    learnerName: "",
    skill: req.skill,
    status: req.status,
    sentAt: req.sentAt,
    completedReviewId: req.completedReviewId,
  };
}

export async function fetchContextReviewRequests(
  userId: string,
): Promise<ContextReviewRequestDisplay[]> {
  const { data, error } = await supabase
    .from("review_requests")
    .select(`
      *,
      evidence_records ( repository_name, source, github_repo_id ),
      declared_skills ( name )
    `)
    .eq("learner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((row) => mapReviewRequestRow(row as Record<string, unknown>));
}

export async function loadPeerReviewPageData(userId: string): Promise<{
  projects: PeerReviewProject[];
  reviews: PeerReview[];
  legacyInvitations: ReviewInvitation[];
  contextRequests: ContextReviewRequestDisplay[];
}> {
  const [
    dbProjects,
    linkedEvidence,
    evidenceProjects,
    reviews,
    legacyInvitations,
    contextRequests,
    contributors,
  ] = await Promise.all([
    safeLoad(() => fetchProjectsFromDb(userId), [] as Project[]),
    safeLoad(() => fetchLinkedProjectEvidence(userId), [] as ProjectEvidenceApiView[]),
    safeLoad(() => fetchEvidenceRecordProjects(userId), [] as ProjectEvidenceApiView[]),
    safeLoad(() => fetchPeerReviews(userId), [] as PeerReview[]),
    safeLoad(() => fetchInvitations(userId), [] as ReviewInvitation[]),
    safeLoad(() => fetchContextReviewRequests(userId), [] as ContextReviewRequestDisplay[]),
    safeLoad(() => fetchContributors(userId), [] as Array<ProjectContributor & { repoId: number }>),
  ]);

  const projects = attachContributors(
    buildPeerReviewProjects(dbProjects, linkedEvidence, evidenceProjects),
    contributors,
  );

  return { projects, reviews, legacyInvitations, contextRequests };
}

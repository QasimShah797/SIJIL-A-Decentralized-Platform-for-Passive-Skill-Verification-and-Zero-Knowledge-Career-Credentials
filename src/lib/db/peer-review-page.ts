/**
 * Real data loaders for the Peer Reviews page (replaces sijil-data mock/localStorage).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectsFromDb } from "@/lib/db/projects";
import { fetchLinkedProjectEvidence } from "@/lib/db/github-evidence";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import { fetchPeerReviews, fetchInvitations } from "@/lib/db/peer-reviews";
import { fetchDeclaredSkills } from "@/lib/db/skills";
import { cleanupOrphanedLearnerReviewData } from "@/lib/db/skill-cleanup";
import {
  filterInvitationsForDeclaredSkills,
  filterProjectsForDeclaredSkills,
  filterReviewsForDeclaredSkills,
} from "@/lib/skill-review-filter";
import { isApiEnabled } from "@/services/api/client";
import {
  getPeerReviewProjectsApi,
  getPeerReviewsApi,
} from "@/services/api/peer-review.api";
import { isMissingColumnError, isMissingRelationError } from "@/lib/supabase-errors";
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

export type InvitationRecordSource = "peer" | "request" | "legacy";

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
  recordSource: InvitationRecordSource;
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
  review: PeerReview & Record<string, unknown>,
  project: PeerReviewProject,
  contributor: ProjectContributor,
): boolean {
  const reviewAuthor = String(
    review?.reviewerName
    ?? review?.reviewer_name
    ?? review?.reviewer
    ?? review?.comment_author
    ?? review?.username
    ?? "",
  ).toLowerCase();

  const contributorName = String(
    contributor?.handle
    ?? contributor?.username
    ?? contributor?.login
    ?? contributor?.name
    ?? "",
  ).toLowerCase().replace(/^@/, "");

  if (!reviewAuthor || !contributorName) {
    return false;
  }

  const nameMatch =
    reviewAuthor.includes(contributorName)
    || contributorName.includes(reviewAuthor);

  const projectName = String(project?.name ?? "").toLowerCase();
  const evidenceLabel = String(review?.evidenceLabel ?? "").toLowerCase();
  const repositoryName = String(review?.repository_name ?? "").toLowerCase();
  const reviewProjectId = review?.projectId;
  const reviewProjectName = review?.projectName;

  const hasProjectContext = Boolean(
    reviewProjectId || reviewProjectName || evidenceLabel || repositoryName,
  );

  if (!hasProjectContext) {
    return false;
  }

  const projectMatch =
    (reviewProjectId != null && reviewProjectId === project.id)
    || (reviewProjectName != null && reviewProjectName === project.name)
    || (evidenceLabel && projectName && evidenceLabel.includes(projectName))
    || (repositoryName && projectName && (
      repositoryName.includes(projectName) || projectName.includes(repositoryName)
    ));

  return nameMatch && projectMatch;
}

function reviewsForProject(project: PeerReviewProject, reviews: PeerReview[]): PeerReview[] {
  if (!Array.isArray(reviews)) return [];

  const projectName = String(project?.name ?? "").toLowerCase();
  return reviews.filter((r) => {
    const evidenceLabel = String(r?.evidenceLabel ?? "").toLowerCase();
    const repositoryName = String(
      (r as PeerReview & Record<string, unknown>)?.repository_name ?? "",
    ).toLowerCase();
    return (r.projectId != null && r.projectId === project.id)
      || (r.projectName != null && r.projectName === project.name)
      || (evidenceLabel && projectName && evidenceLabel.includes(projectName))
      || (repositoryName && projectName && (
        repositoryName.includes(projectName) || projectName.includes(repositoryName)
      ));
  });
}

export function buildContributorRows(
  project: PeerReviewProject,
  reviews: PeerReview[],
  requests: ContextReviewRequestDisplay[],
  legacyInvitations: ReviewInvitation[],
): ContributorRow[] {
  const contributors = Array.isArray(project?.contributors) ? project.contributors : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeInvitations = Array.isArray(legacyInvitations) ? legacyInvitations : [];

  return contributors.map((c) => {
    const review = safeReviews.find((r) => reviewMatchesContributor(r, project, c));
    const ctxRequest = safeRequests.find(
      (r) => r.projectId === project.id
        && (r.contributorName === c.name || r.contributorName === c.handle),
    );
    const legacyInv = safeInvitations.find(
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
        reviewLink: legacyInv.reviewLink
          ?? (legacyInv.token
            ? `${window.location.origin}/review/invite/${legacyInv.token}`
            : `${window.location.origin}/review/${legacyInv.id}`),
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
    recordSource: "request",
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
    email: (c.contributor_email as string | null) ?? undefined,
    role: "Project Collaborator" as const,
    avatarUrl: c.contributor_avatar_url as string | undefined,
    repoId: c.repo_id as number,
  }));
}

async function fetchEvidenceRecordProjects(userId: string): Promise<ProjectEvidenceApiView[]> {
  const { data, error } = await supabase
    .from("evidence_records")
    .select("id, repository_name, repository_url, github_repo_id, metadata")
    .eq("user_id", userId)
    .eq("source", "GitHub")
    .order("last_updated", { ascending: false, nullsFirst: false });

  if (error) {
    if (!isMissingRelationError(error) && !isMissingColumnError(error)) {
      console.warn("evidence_records project query failed:", error);
    }
    return [];
  }
  if (!data?.length) return [];

  const { data: links, error: linksError } = await supabase
    .from("skill_evidence_links")
    .select("evidence_record_id, skill_id, linked_at, declared_skills(name)")
    .eq("user_id", userId);

  if (linksError && !isMissingRelationError(linksError)) {
    console.warn("skill_evidence_links query failed:", linksError);
  }

  const linksByEvidence = new Map<string, { skillId: string; skillName: string; matchReason: string | null; linkedAt: string }[]>();
  for (const link of links ?? []) {
    const evidenceId = link.evidence_record_id as string;
    const skillData = link.declared_skills as { name?: string } | null;
    const entry = {
      skillId: link.skill_id as string,
      skillName: skillData?.name ?? "",
      matchReason: null,
      linkedAt: link.linked_at as string,
    };
    const list = linksByEvidence.get(evidenceId) ?? [];
    list.push(entry);
    linksByEvidence.set(evidenceId, list);
  }

  return data.map((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    const repoFullName = (metadata?.full_name as string | undefined)
      ?? (metadata?.repo_full_name as string | undefined)
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
    token: req.token,
    skillId: req.skillId ?? undefined,
    recordSource: req.recordSource,
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

export async function fetchPeerReviewInvites(
  userId: string,
): Promise<ContextReviewRequestDisplay[]> {
  const { data, error } = await supabase
    .from("peer_review_invites")
    .select("*")
    .eq("learner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((row) => {
    const statusRaw = row.status as string;
    const status: ContextReviewRequestDisplay["status"] =
      statusRaw === "completed" ? "Completed"
        : statusRaw === "expired" ? "Expired"
          : "Sent";
    return {
      id: row.id as string,
      token: row.token as string,
      projectId: row.project_id as string,
      projectName: row.project_name as string,
      source: row.source as Project["source"],
      contributorId: row.contributor_id as string,
      contributorName: row.contributor_name as string,
      contributorEmail: row.contributor_email as string,
      contributorRole: row.contributor_role as string,
      skill: row.skill as string,
      skillId: (row.skill_id as string) ?? null,
      status,
      sentAt: row.created_at as string,
      completedReviewId: (row.completed_review_id as string) ?? undefined,
      recordSource: "peer",
    };
  });
}

const PEER_REVIEW_INVITE_TTL_DAYS = 14;

function generateInviteToken(): string {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function sendPeerReviewInvite(input: {
  userId: string;
  project: PeerReviewProject;
  contributor: ProjectContributor;
  skillName: string;
  skillId: string | null;
  contributorEmail: string;
}): Promise<{ ok: boolean; error?: string; invite?: ContextReviewRequestDisplay }> {
  const normalizedEmail = input.contributorEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, error: "email_required" };
  }

  const { data: existing } = await supabase
    .from("peer_review_invites")
    .select("id, token, status, created_at")
    .eq("learner_user_id", input.userId)
    .eq("project_id", input.project.id)
    .eq("contributor_id", input.contributor.id)
    .neq("status", "completed")
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      invite: {
        id: existing.id as string,
        token: existing.token as string,
        projectId: input.project.id,
        projectName: input.project.name,
        source: input.project.source,
        contributorId: input.contributor.id,
        contributorName: input.contributor.name,
        contributorEmail: normalizedEmail,
        contributorRole: input.contributor.role,
        skill: input.skillName,
        skillId: input.skillId,
        status: "Sent",
        sentAt: existing.created_at as string,
      },
    };
  }

  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PEER_REVIEW_INVITE_TTL_DAYS);

  const { data, error } = await supabase
    .from("peer_review_invites")
    .insert({
      learner_user_id: input.userId,
      evidence_record_id: input.project.evidenceRecordId ?? null,
      project_id: input.project.id,
      project_name: input.project.name,
      source: input.project.source,
      contributor_id: input.contributor.id,
      contributor_name: input.contributor.name,
      contributor_email: normalizedEmail,
      contributor_role: input.contributor.role,
      relationship: "contributor",
      skill_id: input.skillId,
      skill: input.skillName,
      token,
      status: "sent",
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create review invitation" };
  }

  return {
    ok: true,
    invite: {
      id: data.id as string,
      token: data.token as string,
      projectId: data.project_id as string,
      projectName: data.project_name as string,
      source: data.source as Project["source"],
      contributorId: data.contributor_id as string,
      contributorName: data.contributor_name as string,
      contributorEmail: data.contributor_email as string,
      contributorRole: data.contributor_role as string,
      skill: data.skill as string,
      skillId: (data.skill_id as string) ?? null,
      status: "Sent",
      sentAt: data.created_at as string,
    },
  };
}

async function resolveProjectForInvite(
  userId: string,
  projectId: string,
): Promise<PeerReviewProject | null> {
  if (projectId.startsWith("gh-")) {
    const repoId = Number(projectId.slice(3));
    if (!repoId) return null;

    const [{ data: repo }, { data: evidence }] = await Promise.all([
      supabase
        .from("github_repos")
        .select("repo_id, repo_name, full_name, github_url, linked_skill_id, linked_skill_name")
        .eq("user_id", userId)
        .eq("repo_id", repoId)
        .maybeSingle(),
      supabase
        .from("evidence_records")
        .select("id, repository_name, repository_url")
        .eq("user_id", userId)
        .eq("github_repo_id", repoId)
        .maybeSingle(),
    ]);

    if (!repo) return null;
    return {
      id: projectId,
      name: repo.repo_name as string,
      source: "GitHub",
      url: repo.github_url as string,
      evidenceLabel: `GitHub repo: ${repo.full_name as string}`,
      linkedSkills: repo.linked_skill_name ? [repo.linked_skill_name as string] : [],
      contributors: [],
      evidenceRecordId: evidence?.id as string | undefined,
      skillLinks: repo.linked_skill_id
        ? [{
          skillId: repo.linked_skill_id as string,
          skillName: repo.linked_skill_name as string,
        }]
        : [],
    };
  }

  const evidenceId = projectId.startsWith("ev-") ? projectId.slice(3) : projectId;
  const { data: evidence } = await supabase
    .from("evidence_records")
    .select("id, repository_name, repository_url, github_repo_id")
    .eq("user_id", userId)
    .eq("id", evidenceId)
    .maybeSingle();

  if (!evidence) return null;

  const githubRepoId = Number(evidence.github_repo_id ?? 0);
  return {
    id: githubRepoId ? `gh-${githubRepoId}` : `ev-${evidence.id}`,
    name: evidence.repository_name as string,
    source: "GitHub",
    url: evidence.repository_url as string,
    evidenceLabel: `GitHub evidence: ${evidence.repository_name as string}`,
    linkedSkills: [],
    contributors: [],
    evidenceRecordId: evidence.id as string,
    skillLinks: [],
  };
}

async function resolveContributorForInvite(
  userId: string,
  contributorId: string,
): Promise<ProjectContributor | null> {
  const { data } = await supabase
    .from("github_repo_contributors")
    .select("id, full_name, contributor_login, contributor_email, contributor_avatar_url")
    .eq("user_id", userId)
    .eq("id", contributorId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    name: data.full_name as string,
    handle: data.contributor_login as string,
    email: (data.contributor_email as string | null) ?? undefined,
    role: "Project Collaborator",
    avatarUrl: data.contributor_avatar_url as string | undefined,
  };
}

/** Supabase fallback when the custom backend API is unreachable. */
export async function createPeerReviewInviteLocal(input: {
  projectId: string;
  contributorId: string;
  skillId: string;
  contributorEmail: string;
}): Promise<{
  inviteId: string;
  token: string;
  reviewLink: string;
  status: string;
} | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [project, contributor, skillResult] = await Promise.all([
    resolveProjectForInvite(userId, input.projectId),
    resolveContributorForInvite(userId, input.contributorId),
    supabase
      .from("declared_skills")
      .select("id, name")
      .eq("user_id", userId)
      .eq("id", input.skillId)
      .maybeSingle(),
  ]);

  if (!project || !contributor) return null;

  const skillName = (skillResult.data?.name as string | undefined) ?? "Declared competency";
  const result = await sendPeerReviewInvite({
    userId,
    project,
    contributor,
    skillName,
    skillId: input.skillId,
    contributorEmail: input.contributorEmail,
  });

  if (!result.ok || !result.invite) return null;

  return {
    inviteId: result.invite.id,
    token: result.invite.token,
    reviewLink: `${window.location.origin}/review/request/${result.invite.token}`,
    status: "sent",
  };
}

export async function loadPeerReviewPageData(userId: string): Promise<{
  projects: PeerReviewProject[];
  reviews: PeerReview[];
  legacyInvitations: ReviewInvitation[];
  contextRequests: ContextReviewRequestDisplay[];
}> {
  const [
    legacyInvitations,
    contextRequests,
    peerReviewInvites,
  ] = await Promise.all([
    safeLoad(() => fetchInvitations(userId), [] as ReviewInvitation[]),
    safeLoad(() => fetchContextReviewRequests(userId), [] as ContextReviewRequestDisplay[]),
    safeLoad(() => fetchPeerReviewInvites(userId), [] as ContextReviewRequestDisplay[]),
  ]);

  const allContextRequests = [...peerReviewInvites, ...contextRequests];
  const declaredSkills = await safeLoad(
    () => fetchDeclaredSkills(userId),
    [],
  );
  const skillRefs = declaredSkills.map((skill) => ({ id: skill.id, name: skill.name }));

  if (!skillRefs.length) {
    await safeLoad(() => cleanupOrphanedLearnerReviewData(userId), undefined);
  }

  if (isApiEnabled()) {
    const [apiProjects, apiReviews] = await Promise.all([
      getPeerReviewProjectsApi(),
      getPeerReviewsApi(),
    ]);
    if (apiProjects) {
      return {
        projects: filterProjectsForDeclaredSkills(apiProjects, skillRefs),
        reviews: filterReviewsForDeclaredSkills(apiReviews ?? [], skillRefs),
        legacyInvitations: filterInvitationsForDeclaredSkills(legacyInvitations, skillRefs),
        contextRequests: filterInvitationsForDeclaredSkills(allContextRequests, skillRefs),
      };
    }
  }

  const [
    dbProjects,
    linkedEvidence,
    evidenceProjects,
    reviews,
    contributors,
  ] = await Promise.all([
    safeLoad(() => fetchProjectsFromDb(userId), [] as Project[]),
    safeLoad(() => fetchLinkedProjectEvidence(userId), [] as ProjectEvidenceApiView[]),
    safeLoad(() => fetchEvidenceRecordProjects(userId), [] as ProjectEvidenceApiView[]),
    safeLoad(() => fetchPeerReviews(userId), [] as PeerReview[]),
    safeLoad(() => fetchContributors(userId), [] as Array<ProjectContributor & { repoId: number }>),
  ]);

  const projects = filterProjectsForDeclaredSkills(
    attachContributors(
      buildPeerReviewProjects(dbProjects, linkedEvidence, evidenceProjects),
      contributors,
    ),
    skillRefs,
  );

  return {
    projects,
    reviews: filterReviewsForDeclaredSkills(reviews, skillRefs),
    legacyInvitations: filterInvitationsForDeclaredSkills(legacyInvitations, skillRefs),
    contextRequests: filterInvitationsForDeclaredSkills(allContextRequests, skillRefs),
  };
}

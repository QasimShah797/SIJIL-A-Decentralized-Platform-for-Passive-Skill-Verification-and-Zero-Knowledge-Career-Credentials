/**
 * Peer review service — projects, contributors, invites, submit, stats.
 * Only verified contributors of the same synced project may submit reviews.
 */
import { randomBytes } from "crypto";
import { supabaseService } from "./supabase.service";
import { reviewsService } from "./reviews.service";
import { AppError } from "../utils/AppError";
import { buildReviewLink, sendReviewRequestEmail } from "../utils/reviewEmail";
import {
  RELATIONSHIP,
  PEER_REVIEW_INVITE_STATUS,
  PEER_REVIEW_TOKEN_TTL_DAYS,
  CONTEXT_STATUS,
  CONTRIBUTOR_VERIFICATION,
  relationshipFromRole,
  categoricalTrustWeight,
  trustScoreForRelationship,
  displayRoleForRelationship,
} from "../constants/peer-review";
import { REVIEW_TYPE } from "../constants/reviews";
import {
  fetchDeclaredSkillRefs,
  filterInvitationsForDeclaredSkills,
  filterProjectsForDeclaredSkills,
  filterReviewsForDeclaredSkills,
} from "../utils/skill-review-filter";
import type {
  CreatePeerReviewInviteInput,
  PeerReviewContributorView,
  PeerReviewInviteResult,
  PeerReviewProjectView,
  PeerReviewRecordView,
  PeerReviewStatsView,
  SubmitPeerReviewInput,
  PeerReviewInviteFormView,
} from "../types/peer-review.types";
import type { Relationship } from "../constants/peer-review";
import { withPeerReviewUserColumns } from "../utils/peerReviewInsert";
import {
  getGitHubConnection,
  persistContributorEmail,
  resolveGitHubUserEmail,
} from "../utils/githubContributorEmail";

type EvidenceRow = {
  id: string;
  user_id: string;
  source: string;
  repository_name: string;
  repository_url: string;
  repo_full_name: string | null;
  github_repo_id: number | null;
  metadata: Record<string, unknown> | null;
};

type ResolvedProject = {
  projectId: string;
  name: string;
  source: PeerReviewProjectView["source"];
  url?: string;
  evidenceLabel: string;
  evidenceRecordId?: string;
  githubRepoId?: number;
  repoFullName?: string;
};

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function contributorIdentityMatches(
  contributor: Pick<PeerReviewContributorView, "id" | "name" | "handle" | "email">,
  contributorId: string,
  contributorEmail?: string,
): boolean {
  const requestedId = normalizeText(contributorId);
  const requestedEmail = normalizeText(contributorEmail);
  const contributorHandle = normalizeText(contributor.handle);
  const contributorName = normalizeText(contributor.name);
  const contributorIdValue = normalizeText(contributor.id);
  const contributorEmailValue = normalizeText(contributor.email);

  if (requestedId && (
    contributorIdValue === requestedId
    || contributorHandle === requestedId.replace(/^@/, "")
    || `@${contributorHandle}` === requestedId
    || contributorName === requestedId
  )) {
    return true;
  }

  return Boolean(
    requestedEmail
    && contributorEmailValue
    && contributorEmailValue === requestedEmail,
  );
}

import {
  assertContributorInviteEmail,
  assertReviewerIdentityForInvite,
  normalizeEmail,
} from "../utils/contributor-invite-email";

function reviewerNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || email;
}

function parseProjectId(projectId: string): { kind: "gh" | "ev" | "lms"; id: string } | null {
  if (projectId.startsWith("gh-")) return { kind: "gh", id: projectId.slice(3) };
  if (projectId.startsWith("ev-")) return { kind: "ev", id: projectId.slice(3) };
  if (projectId.startsWith("lms-")) return { kind: "lms", id: projectId.slice(4) };
  return null;
}

function rowToPeerReview(row: Record<string, unknown>): PeerReviewRecordView {
  const imported = Boolean(row.imported);
  const relationship = (row.relationship as Relationship)
    ?? relationshipFromRole((row.reviewer_role as string) ?? "peer");
  const score = Number(row.trust_weight_score)
    ?? trustScoreForRelationship(relationship, true);

  return {
    id: row.id as string,
    reviewerName: row.reviewer_name as string,
    reviewerRole: (row.reviewer_role as string) ?? displayRoleForRelationship(relationship),
    source: row.source as string,
    origin: (row.origin as string) ?? (imported ? "GitHub PR" : "SIJIL"),
    skill: row.skill as string,
    skillId: (row.skill_id as string | null) ?? null,
    projectId: (row.project_id as string | undefined)
      ?? (row.evidence_record_id ? `ev-${row.evidence_record_id}` : undefined),
    projectName: row.project_name as string | undefined,
    evidenceLabel: row.evidence_label as string,
    evidenceUrl: row.evidence_url as string | undefined,
    rating: row.rating as number,
    comment: row.comment as string,
    recommendation: (row.recommendation as string) ?? undefined,
    date: row.review_date as string,
    contextStatus: (row.context_status as string) ?? CONTEXT_STATUS.VERIFIED,
    contributorVerification: (row.contributor_verification as string) ?? undefined,
    trustWeight: (row.trust_weight as string) ?? categoricalTrustWeight(score),
    trustWeightScore: score,
    relationship,
    imported,
  };
}

function reviewMatchesContributor(
  review: PeerReviewRecordView,
  project: ResolvedProject,
  contributor: { id: string; name: string; handle?: string },
): boolean {
  const nameMatch =
    review.reviewerName === contributor.handle
    || review.reviewerName === contributor.name
    || review.reviewerName === `@${contributor.handle}`;
  const projectMatch =
    review.projectId === project.projectId
    || review.projectName === project.name;
  return nameMatch && projectMatch;
}

async function getSkillLinksForUser(userId: string): Promise<Map<string, { skillId: string; skillName: string }[]>> {
  const { data: links } = await supabaseService.client
    .from("skill_evidence_links")
    .select("evidence_record_id, skill_id, declared_skills(name)")
    .eq("user_id", userId);

  const map = new Map<string, { skillId: string; skillName: string }[]>();
  for (const link of links ?? []) {
    const evidenceId = link.evidence_record_id as string;
    const skillData = link.declared_skills as { name?: string } | { name?: string }[] | null;
    const skillName = Array.isArray(skillData)
      ? skillData[0]?.name ?? ""
      : skillData?.name ?? "";
    const entry = { skillId: link.skill_id as string, skillName };
    const list = map.get(evidenceId) ?? [];
    list.push(entry);
    map.set(evidenceId, list);
  }
  return map;
}

async function resolveProject(userId: string, projectId: string): Promise<ResolvedProject> {
  const parsed = parseProjectId(projectId);
  if (!parsed) throw new AppError("Invalid project id", 400);

  if (parsed.kind === "lms") {
    const { data: lms } = await supabaseService.client
      .from("lms_evidence")
      .select("id, course_name, course_url")
      .eq("id", parsed.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!lms) throw new AppError("LMS project not found", 404);
    return {
      projectId,
      name: lms.course_name as string,
      source: "LMS",
      url: (lms.course_url as string) ?? undefined,
      evidenceLabel: `LMS: ${lms.course_name}`,
    };
  }

  if (parsed.kind === "ev") {
    const evidence = await getEvidenceForUser(userId, parsed.id);
    const repoFullName = evidence.repo_full_name
      ?? (evidence.metadata?.full_name as string | undefined)
      ?? evidence.repository_name;
    return {
      projectId,
      name: evidence.repository_name,
      source: evidence.source as ResolvedProject["source"],
      url: evidence.repository_url,
      evidenceLabel: `${evidence.source}: ${repoFullName}`,
      evidenceRecordId: evidence.id,
      githubRepoId: evidence.github_repo_id ?? undefined,
      repoFullName,
    };
  }

  const repoId = Number(parsed.id);
  const [{ data: repo }, { data: evidence }] = await Promise.all([
    supabaseService.client
      .from("github_repos")
      .select("repo_id, repo_name, full_name, github_url")
      .eq("user_id", userId)
      .eq("repo_id", repoId)
      .maybeSingle(),
    supabaseService.client
      .from("evidence_records")
      .select("id, repository_name, repository_url, repo_full_name, source, metadata, github_repo_id")
      .eq("user_id", userId)
      .eq("github_repo_id", repoId)
      .maybeSingle(),
  ]);

  if (!repo && !evidence) throw new AppError("GitHub project not found", 404);

  const name = (repo?.repo_name as string) ?? (evidence?.repository_name as string);
  const fullName = (repo?.full_name as string)
    ?? (evidence?.repo_full_name as string)
    ?? name;

  return {
    projectId,
    name,
    source: "GitHub",
    url: (repo?.github_url as string) ?? (evidence?.repository_url as string),
    evidenceLabel: `GitHub repo: ${fullName}`,
    evidenceRecordId: evidence?.id as string | undefined,
    githubRepoId: repoId,
    repoFullName: fullName,
  };
}

async function getEvidenceForUser(userId: string, evidenceId: string): Promise<EvidenceRow> {
  const { data, error } = await supabaseService.client
    .from("evidence_records")
    .select("id, user_id, source, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
    .eq("id", evidenceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!data) throw new AppError("Evidence not found", 404);
  return data as EvidenceRow;
}

async function fetchContributorsForProject(
  userId: string,
  project: ResolvedProject,
): Promise<PeerReviewContributorView[]> {
  if (project.evidenceRecordId) {
    const { data: contexts } = await supabaseService.client
      .from("reviewer_contexts")
      .select("*")
      .eq("evidence_record_id", project.evidenceRecordId)
      .eq("user_id", userId);

    if (contexts?.length) {
      return contexts.map((c) => {
        const relationship = relationshipFromRole(c.context_role as string);
        return {
          id: c.id as string,
          name: c.reviewer_name as string,
          handle: (c.reviewer_login as string) ?? undefined,
          email: (c.reviewer_email as string) ?? undefined,
          role: displayRoleForRelationship(relationship),
          relationship,
          verified: true,
          reviewStatus: "Review Pending" as const,
        };
      });
    }
  }

  if (project.githubRepoId != null) {
    const { data: contributors } = await supabaseService.client
      .from("github_repo_contributors")
      .select("*")
      .eq("user_id", userId)
      .eq("repo_id", project.githubRepoId);

    return (contributors ?? []).map((c) => ({
      id: c.id as string,
      name: c.full_name as string,
      handle: c.contributor_login as string,
      email: (c.contributor_email as string) ?? undefined,
      role: displayRoleForRelationship(RELATIONSHIP.CONTRIBUTOR),
      relationship: RELATIONSHIP.CONTRIBUTOR,
      avatarUrl: (c.contributor_avatar_url as string) ?? undefined,
      verified: true,
      reviewStatus: "Review Pending" as const,
    }));
  }

  return [];
}

async function enrichContributorEmails(
  userId: string,
  project: ResolvedProject,
  contributors: PeerReviewContributorView[],
): Promise<PeerReviewContributorView[]> {
  if (project.source !== "GitHub") return contributors;

  const missing = contributors.filter((c) => !c.email?.trim() && c.handle?.trim());
  if (!missing.length) return contributors;

  const ghConn = await getGitHubConnection(userId);
  if (!ghConn) return contributors;

  const enriched = await Promise.all(
    contributors.map(async (contributor) => {
      if (contributor.email?.trim() || !contributor.handle?.trim()) return contributor;

      const email = await resolveGitHubUserEmail(
        contributor.handle,
        ghConn.token,
        project.repoFullName,
      );
      if (!email) return contributor;

      await persistContributorEmail(userId, contributor.handle, email, {
        repoId: project.githubRepoId,
        evidenceRecordId: project.evidenceRecordId,
      });

      return { ...contributor, email };
    }),
  );

  return enriched;
}

async function ensureContributorVerified(
  userId: string,
  project: ResolvedProject,
  contributorId: string,
  contributorEmail?: string,
): Promise<PeerReviewContributorView> {
  const contributors = await fetchContributorsForProject(userId, project);
  const contributor = contributors.find((c) => contributorIdentityMatches(c, contributorId, contributorEmail));
  if (!contributor) {
    throw new AppError("Only verified contributors of the same project can submit reviews", 403);
  }
  return contributor;
}

async function getLearnerName(userId: string): Promise<string> {
  const { data: profile } = await supabaseService.client
    .from("learner_profiles")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  return profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"
    : "Learner";
}

async function findExistingReview(
  userId: string,
  project: ResolvedProject,
  contributor: PeerReviewContributorView,
): Promise<PeerReviewRecordView | null> {
  let query = supabaseService.client
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId);

  if (project.evidenceRecordId) {
    query = query.eq("evidence_record_id", project.evidenceRecordId);
  } else {
    query = query.eq("project_id", project.projectId);
  }

  const { data: rows } = await query.order("review_date", { ascending: false });

  const match = (rows ?? [])
    .map((r) => rowToPeerReview(r as Record<string, unknown>))
    .find((r) => reviewMatchesContributor(r, project, contributor));
  return match ?? null;
}

function buildReviewInsertPayload(input: {
  learnerUserId: string;
  contributor: PeerReviewContributorView;
  project: ResolvedProject;
  skillName: string;
  skillId: string | null;
  rating: number;
  comment: string;
  recommendation: string;
  origin: string;
  imported: boolean;
  reviewType: string;
  externalReference?: string;
  evidenceLabel?: string;
  evidenceUrl?: string;
  inviteId?: string;
  reviewerEmail?: string;
}) {
  const relationship = input.contributor.relationship;
  const score = trustScoreForRelationship(relationship, true);
  const trustWeight = categoricalTrustWeight(score);

  return withPeerReviewUserColumns({
    learner_user_id: input.learnerUserId,
    reviewer_name: input.contributor.handle ?? input.contributor.name,
    reviewer_role: input.contributor.role,
    reviewer_email: input.reviewerEmail ?? input.contributor.email ?? null,
    source: input.project.source,
    origin: input.origin,
    skill: input.skillName,
    project_id: input.project.projectId,
    project_name: input.project.name,
    evidence_label: input.evidenceLabel ?? input.project.evidenceLabel,
    evidence_url: input.evidenceUrl ?? input.project.url,
    rating: input.rating,
    comment: input.comment,
    recommendation: input.recommendation,
    review_type: input.reviewType,
    evidence_record_id: input.project.evidenceRecordId ?? null,
    skill_id: input.skillId,
    context_status: CONTEXT_STATUS.VERIFIED,
    contributor_verification: CONTRIBUTOR_VERIFICATION.VERIFIED,
    trust_weight: trustWeight,
    trust_weight_score: score,
    relationship,
    imported: input.imported,
    external_reference: input.externalReference ?? null,
  });
}

async function triggerGitHubImport(userId: string, project: ResolvedProject): Promise<void> {
  if (project.source !== "GitHub") return;
  try {
    if (project.evidenceRecordId) {
      await reviewsService.importExternalForEvidence(userId, project.evidenceRecordId);
    } else {
      await reviewsService.importExternalForProject(userId, project.projectId);
    }
  } catch {
    // Best-effort import when loading contributors or sending invites.
  }
}

async function fetchSupplementalGitHubReviews(userId: string): Promise<PeerReviewRecordView[]> {
  const { data, error } = await supabaseService.client
    .from("github_discussion_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .order("comment_created_at", { ascending: false, nullsFirst: false });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: `gh-discussion-${row.id as string}`,
    reviewerName: (row.comment_author as string) ?? "GitHub reviewer",
    reviewerRole: "Project Collaborator",
    source: "GitHub",
    origin: "GitHub Discussion",
    skill: (row.competency_name as string) ?? (row.repo_name as string) ?? "Declared competency",
    projectId: row.repo_name ? `gh-discussion:${row.repo_name as string}` : undefined,
    projectName: (row.repo_name as string) ?? undefined,
    evidenceLabel: (row.discussion_title as string) ?? (row.repo_name as string) ?? "GitHub discussion review",
    evidenceUrl: (row.comment_url as string) ?? (row.discussion_url as string) ?? undefined,
    rating: 3,
    comment: (row.comment_body as string) ?? "",
    recommendation: undefined,
    date: (row.comment_created_at as string) ?? (row.created_at as string),
    contextStatus: (row.is_peer_review ? CONTEXT_STATUS.VERIFIED : CONTEXT_STATUS.PENDING) as string,
    contributorVerification: row.is_peer_review ? CONTRIBUTOR_VERIFICATION.VERIFIED : undefined,
    trustWeight: row.is_peer_review ? "High Trust" : "Medium Trust",
    trustWeightScore: row.is_peer_review ? 0.9 : 0.6,
    relationship: RELATIONSHIP.CONTRIBUTOR,
    imported: true,
  })).filter((review) => review.comment.trim().length > 0);
}

async function fetchSupplementalLmsReviews(userId: string): Promise<PeerReviewRecordView[]> {
  const [feedbackRes, assignmentsRes, importedEvidenceRes, lmsEvidenceRes, skillsRes] = await Promise.all([
    supabaseService.client
      .from("moodle_feedback")
      .select("moodle_assignment_id, feedback_text, synced_at, created_at")
      .eq("user_id", userId),
    supabaseService.client
      .from("moodle_assignments")
      .select("moodle_assignment_id, moodle_course_id, name, submission_status, graded_at, submitted_at, synced_at")
      .eq("user_id", userId),
    supabaseService.client
      .from("imported_lms_evidence")
      .select("moodle_assignment_id, moodle_course_id, course_name, activity_name, lms_evidence_id, imported_at")
      .eq("user_id", userId),
    supabaseService.client
      .from("lms_evidence")
      .select("id, linked_skill_id, course_name")
      .eq("user_id", userId),
    supabaseService.client
      .from("declared_skills")
      .select("id, name")
      .eq("user_id", userId),
  ]);

  if (feedbackRes.error) return [];

  const assignmentsById = new Map(
    (assignmentsRes.data ?? []).map((row) => [Number(row.moodle_assignment_id), row as Record<string, unknown>]),
  );
  const importedByAssignmentId = new Map(
    (importedEvidenceRes.data ?? []).map((row) => [Number(row.moodle_assignment_id), row as Record<string, unknown>]),
  );
  const lmsEvidenceById = new Map(
    (lmsEvidenceRes.data ?? []).map((row) => [row.id as string, row as Record<string, unknown>]),
  );
  const skillNameById = new Map(
    (skillsRes.data ?? []).map((row) => [row.id as string, row.name as string]),
  );

  return (feedbackRes.data ?? [])
    .map((row) => {
      const assignmentId = Number(row.moodle_assignment_id);
      const assignment = assignmentsById.get(assignmentId);
      const imported = importedByAssignmentId.get(assignmentId);
      const lmsEvidence = imported?.lms_evidence_id
        ? lmsEvidenceById.get(imported.lms_evidence_id as string)
        : null;
      const skillName = lmsEvidence?.linked_skill_id
        ? skillNameById.get(lmsEvidence.linked_skill_id as string)
        : null;
      const comment = (row.feedback_text as string | null)?.trim() ?? "";
      if (!comment) return null;

      return {
        id: `lms-feedback-${assignmentId}`,
        reviewerName: "LMS Instructor",
        reviewerRole: "Teacher Feedback",
        source: "LMS",
        origin: "Moodle Feedback",
        skill: skillName ?? (lmsEvidence?.course_name as string) ?? (imported?.course_name as string) ?? "LMS coursework",
        projectId: `lms-${assignmentId}`,
        projectName: (imported?.course_name as string) ?? (lmsEvidence?.course_name as string) ?? "Moodle assignment",
        evidenceLabel: (assignment?.name as string) ?? (imported?.activity_name as string) ?? "Moodle assignment feedback",
        evidenceUrl: undefined,
        rating: 4,
        comment,
        recommendation: undefined,
        date: (row.synced_at as string) ?? (row.created_at as string) ?? (assignment?.graded_at as string) ?? new Date().toISOString(),
        contextStatus: CONTEXT_STATUS.VERIFIED,
        contributorVerification: CONTRIBUTOR_VERIFICATION.VERIFIED,
        trustWeight: "High Trust",
        trustWeightScore: 0.95,
        relationship: RELATIONSHIP.INSTRUCTOR,
        imported: true,
      } satisfies PeerReviewRecordView;
    })
    .filter((review): review is PeerReviewRecordView => review !== null);
}

export class PeerReviewService {
  async getProjects(userId: string): Promise<PeerReviewProjectView[]> {
    const skillLinksByEvidence = await getSkillLinksForUser(userId);

    const [{ data: repos }, { data: evidenceRows }, { data: lmsRows }] = await Promise.all([
      supabaseService.client
        .from("github_repos")
        .select("repo_id, repo_name, full_name, github_url, linked_skill_name")
        .eq("user_id", userId)
        .order("last_updated", { ascending: false, nullsFirst: false }),
      supabaseService.client
        .from("evidence_records")
        .select("id, repository_name, repository_url, repo_full_name, github_repo_id, source, metadata")
        .eq("user_id", userId)
        .in("source", ["GitHub", "LMS"])
        .order("last_updated", { ascending: false, nullsFirst: false }),
      supabaseService.client
        .from("lms_evidence")
        .select("id, course_name, course_url")
        .eq("user_id", userId)
        .limit(50),
    ]);

    const evidenceByRepoId = new Map<number, EvidenceRow>();
    for (const row of evidenceRows ?? []) {
      const repoId = Number(row.github_repo_id ?? 0);
      if (repoId) evidenceByRepoId.set(repoId, row as EvidenceRow);
    }

    const projects: PeerReviewProjectView[] = [];

    for (const repo of repos ?? []) {
      const repoId = repo.repo_id as number;
      const evidence = evidenceByRepoId.get(repoId);
      const skillLinks = evidence
        ? (skillLinksByEvidence.get(evidence.id) ?? [])
        : [];
      const project = await resolveProject(userId, `gh-${repoId}`);
      const contributors = await fetchContributorsForProject(userId, project);
      projects.push({
        id: `gh-${repoId}`,
        name: repo.repo_name as string,
        source: "GitHub",
        url: repo.github_url as string,
        evidenceLabel: `GitHub repo: ${repo.full_name}`,
        linkedSkills: skillLinks.length
          ? skillLinks.map((s) => s.skillName)
          : repo.linked_skill_name ? [repo.linked_skill_name as string] : [],
        contributors,
        evidenceRecordId: evidence?.id,
        skillLinks,
      });
    }

    for (const row of evidenceRows ?? []) {
      const repoId = Number(row.github_repo_id ?? 0);
      if (repoId && projects.some((p) => p.id === `gh-${repoId}`)) continue;
      const projectId = repoId ? `gh-${repoId}` : `ev-${row.id}`;
      const project = await resolveProject(userId, projectId);
      const skillLinks = skillLinksByEvidence.get(row.id as string) ?? [];
      const contributors = await fetchContributorsForProject(userId, project);
      const metadata = row.metadata as Record<string, unknown> | null;
      const fullName = (row.repo_full_name as string | null)
        ?? (metadata?.full_name as string | undefined)
        ?? (row.repository_name as string);
      projects.push({
        id: projectId,
        name: row.repository_name as string,
        source: (row.source as PeerReviewProjectView["source"]) ?? "GitHub",
        url: row.repository_url as string,
        evidenceLabel: `${row.source}: ${fullName}`,
        linkedSkills: skillLinks.map((s) => s.skillName),
        contributors,
        evidenceRecordId: row.id as string,
        skillLinks,
      });
    }

    for (const lms of lmsRows ?? []) {
      const projectId = `lms-${lms.id}`;
      if (projects.some((p) => p.id === projectId)) continue;
      projects.push({
        id: projectId,
        name: lms.course_name as string,
        source: "LMS",
        url: (lms.course_url as string) ?? undefined,
        evidenceLabel: `LMS: ${lms.course_name}`,
        linkedSkills: [],
        contributors: [],
        skillLinks: [],
      });
    }

    const skillRefs = await fetchDeclaredSkillRefs(userId);
    return filterProjectsForDeclaredSkills(projects, skillRefs);
  }

  async getProjectContributors(
    userId: string,
    projectId: string,
  ): Promise<PeerReviewContributorView[]> {
    const project = await resolveProject(userId, projectId);

    await triggerGitHubImport(userId, project);

    let contributors = await fetchContributorsForProject(userId, project);
    contributors = await enrichContributorEmails(userId, project, contributors);
    const reviews = await this.getReviewsForUser(userId);
    const { data: invites } = await supabaseService.client
      .from("peer_review_invites")
      .select("id, contributor_id, status, completed_review_id")
      .eq("learner_user_id", userId)
      .eq("project_id", projectId);

    const inviteByContributor = new Map(
      (invites ?? []).map((i) => [i.contributor_id as string, i]),
    );

    return contributors.map((c) => {
      const review = reviews.find((r) => reviewMatchesContributor(r, project, c));
      const invite = inviteByContributor.get(c.id);
      if (review?.imported) {
        return {
          ...c,
          reviewStatus: "Imported Review Found",
          reviewId: review.id,
          inviteId: invite?.id as string | undefined,
        };
      }
      if (review) {
        return {
          ...c,
          reviewStatus: "Review Received",
          reviewId: review.id,
          inviteId: invite?.id as string | undefined,
        };
      }
      if (invite && invite.status !== PEER_REVIEW_INVITE_STATUS.COMPLETED) {
        return {
          ...c,
          reviewStatus: "Invite Sent",
          inviteId: invite.id as string,
        };
      }
      return { ...c, reviewStatus: "Review Pending" };
    });
  }

  async createInvite(
    userId: string,
    input: CreatePeerReviewInviteInput,
  ): Promise<PeerReviewInviteResult> {
    const project = await resolveProject(userId, input.projectId);
    const contributor = await ensureContributorVerified(userId, project, input.contributorId);

    const { data: skill } = await supabaseService.client
      .from("declared_skills")
      .select("id, name")
      .eq("id", input.skillId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!skill) throw new AppError("Skill not found", 404);

    await triggerGitHubImport(userId, project);

    const existing = await findExistingReview(userId, project, contributor);
    if (existing) {
      return {
        inviteId: "",
        token: "",
        reviewLink: "",
        status: "review_exists",
        importedReviewId: existing.id,
        alreadyReviewed: true,
      };
    }

    const { data: pendingInvite } = await supabaseService.client
      .from("peer_review_invites")
      .select("id, token, status, expires_at")
      .eq("learner_user_id", userId)
      .eq("project_id", input.projectId)
      .eq("contributor_id", input.contributorId)
      .in("status", [PEER_REVIEW_INVITE_STATUS.SENT])
      .maybeSingle();

    if (pendingInvite) {
      const normalizedEmail = normalizeEmail(input.contributorEmail);
      assertContributorInviteEmail({
        contributorId: input.contributorId,
        contributorHandle: contributor.handle,
        contributorEmailOnFile: contributor.email,
        requestedEmail: normalizedEmail,
        existingInviteEmail: pendingInvite.contributor_email as string,
      });
      let token = pendingInvite.token as string;
      let reviewLink = buildReviewLink(token);

      if (!input.resend) {
        return {
          inviteId: pendingInvite.id as string,
          token,
          reviewLink,
          status: "already_invited",
        };
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PEER_REVIEW_TOKEN_TTL_DAYS);
      const isExpired = new Date(pendingInvite.expires_at as string) < new Date();

      if (isExpired) {
        token = generateToken();
        reviewLink = buildReviewLink(token);
      }

      const { error: updateError } = await supabaseService.client
        .from("peer_review_invites")
        .update({
          contributor_email: normalizedEmail,
          token,
          status: PEER_REVIEW_INVITE_STATUS.SENT,
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", pendingInvite.id);

      if (updateError) {
        throw new AppError(updateError.message ?? "Failed to resend peer review invite", 500);
      }

      const learnerName = await getLearnerName(userId);
      await sendReviewRequestEmail(
        normalizedEmail,
        learnerName,
        project.name,
        reviewLink,
        {
          reviewerName: contributor.name,
          skillName: skill.name as string,
        },
      );

      return {
        inviteId: pendingInvite.id as string,
        token,
        reviewLink,
        status: "resent",
      };
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PEER_REVIEW_TOKEN_TTL_DAYS);
    const normalizedEmail = normalizeEmail(input.contributorEmail);

    assertContributorInviteEmail({
      contributorId: input.contributorId,
      contributorHandle: contributor.handle,
      contributorEmailOnFile: contributor.email,
      requestedEmail: normalizedEmail,
    });

    let reviewerContextId: string | null = null;
    if (project.evidenceRecordId) {
      const { data: ctx } = await supabaseService.client
        .from("reviewer_contexts")
        .select("id")
        .eq("evidence_record_id", project.evidenceRecordId)
        .eq("user_id", userId)
        .or(`id.eq.${input.contributorId},reviewer_login.eq.${contributor.handle ?? ""}`)
        .maybeSingle();
      reviewerContextId = (ctx?.id as string) ?? null;
    }

    const { data: invite, error } = await supabaseService.client
      .from("peer_review_invites")
      .insert({
        learner_user_id: userId,
        evidence_record_id: project.evidenceRecordId ?? null,
        project_id: input.projectId,
        project_name: project.name,
        source: project.source,
        contributor_id: input.contributorId,
        contributor_name: contributor.name,
        contributor_email: normalizedEmail,
        contributor_role: contributor.role,
        relationship: contributor.relationship,
        skill_id: skill.id,
        skill: skill.name,
        reviewer_context_id: reviewerContextId,
        token,
        status: PEER_REVIEW_INVITE_STATUS.SENT,
        expires_at: expiresAt.toISOString(),
      })
      .select("*")
      .single();

    if (error || !invite) {
      throw new AppError(error?.message ?? "Failed to create peer review invite", 500);
    }

    const learnerName = await getLearnerName(userId);
    const reviewLink = buildReviewLink(token);
    await sendReviewRequestEmail(
      normalizedEmail,
      learnerName,
      project.name,
      reviewLink,
      {
        reviewerName: contributor.name,
        skillName: skill.name as string,
      },
    );

    return {
      inviteId: invite.id as string,
      token,
      reviewLink,
      status: PEER_REVIEW_INVITE_STATUS.SENT,
    };
  }

  async getInviteByToken(token: string): Promise<PeerReviewInviteFormView> {
    const { data: invite } = await supabaseService.client
      .from("peer_review_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!invite) throw new AppError("Review link is invalid or expired", 404);
    if (invite.status === PEER_REVIEW_INVITE_STATUS.COMPLETED) {
      throw new AppError("This review has already been submitted", 410);
    }
    if (new Date(invite.expires_at as string) < new Date()) {
      await supabaseService.client
        .from("peer_review_invites")
        .update({ status: PEER_REVIEW_INVITE_STATUS.EXPIRED })
        .eq("id", invite.id);
      throw new AppError("Review link has expired", 410);
    }

    const learnerName = await getLearnerName(invite.learner_user_id as string);
    return {
      token,
      status: invite.status as string,
      learnerName,
      skillClaim: invite.skill as string,
      evidenceName: invite.project_name as string,
      contextSource: invite.source as string,
      reviewerContext: displayRoleForRelationship(
        (invite.relationship as Relationship) ?? RELATIONSHIP.CONTRIBUTOR,
      ),
      reviewerName: invite.contributor_name as string,
      expiresAt: invite.expires_at as string,
    };
  }

  async submitReview(input: SubmitPeerReviewInput): Promise<PeerReviewRecordView> {
    const { data: invite } = await supabaseService.client
      .from("peer_review_invites")
      .select("*")
      .eq("token", input.token)
      .maybeSingle();

    if (!invite) throw new AppError("Review invite is invalid or expired", 404);
    if (invite.status === PEER_REVIEW_INVITE_STATUS.COMPLETED) {
      throw new AppError("Review already submitted", 409);
    }
    if (new Date(invite.expires_at as string) < new Date()) {
      await supabaseService.client
        .from("peer_review_invites")
        .update({ status: PEER_REVIEW_INVITE_STATUS.EXPIRED })
        .eq("id", invite.id);
      throw new AppError("Review invite has expired", 410);
    }

    const userId = invite.learner_user_id as string;
    const project = await resolveProject(userId, invite.project_id as string);
    const verifiedContributor = await ensureContributorVerified(
      userId,
      project,
      invite.contributor_id as string,
      invite.contributor_email as string,
    );

    assertReviewerIdentityForInvite({
      invitedEmail: invite.contributor_email as string,
      invitedGithubLogin: verifiedContributor.handle ?? invite.contributor_name as string,
      submittedEmail: input.reviewerEmail,
      submittedGithub: input.reviewerGithubUsername,
    });

    const contributor: PeerReviewContributorView = {
      id: invite.contributor_id as string,
      name: invite.contributor_name as string,
      handle: verifiedContributor.handle,
      role: invite.contributor_role as string,
      relationship: (invite.relationship as Relationship) ?? RELATIONSHIP.CONTRIBUTOR,
      email: invite.contributor_email as string,
      verified: true,
      reviewStatus: "Review Pending",
    };

    const payload = buildReviewInsertPayload({
      learnerUserId: userId,
      contributor,
      project,
      skillName: invite.skill as string,
      skillId: (invite.skill_id as string) ?? null,
      rating: input.rating,
      comment: input.feedback,
      recommendation: input.recommendation,
      origin: "SIJIL",
      imported: false,
      reviewType: REVIEW_TYPE.VERIFIED,
      inviteId: invite.id as string,
      reviewerEmail: invite.contributor_email as string,
    });

    const { data: review, error: reviewErr } = await supabaseService.client
      .from("peer_reviews")
      .insert(payload)
      .select("*")
      .single();

    if (reviewErr || !review) {
      throw new AppError(reviewErr?.message ?? "Failed to store review", 500);
    }

    await supabaseService.client
      .from("peer_review_invites")
      .update({
        status: PEER_REVIEW_INVITE_STATUS.COMPLETED,
        completed_review_id: review.id,
      })
      .eq("id", invite.id);

    return rowToPeerReview(review as Record<string, unknown>);
  }

  async getReviewsForUser(userId: string): Promise<PeerReviewRecordView[]> {
    const [skillRefs, { data, error }] = await Promise.all([
      fetchDeclaredSkillRefs(userId),
      supabaseService.client
        .from("peer_reviews")
        .select("*")
        .eq("learner_user_id", userId)
        .order("review_date", { ascending: false }),
    ]);

    if (error) throw new AppError(error.message, 500);
    const reviews = (data ?? []).map((r) => rowToPeerReview(r as Record<string, unknown>));
    return filterReviewsForDeclaredSkills(reviews, skillRefs);
  }

  async getStats(userId: string): Promise<PeerReviewStatsView> {
    const skillRefs = await fetchDeclaredSkillRefs(userId);
    const [reviews, { data: invites }, { data: legacyInvites }, { data: reviewRequests }] =
      await Promise.all([
        this.getReviewsForUser(userId),
        supabaseService.client
          .from("peer_review_invites")
          .select("status, skill, skill_id")
          .eq("learner_user_id", userId),
        supabaseService.client
          .from("review_invitations")
          .select("status, skill")
          .eq("learner_user_id", userId),
        supabaseService.client
          .from("review_requests")
          .select("status, skill_id")
          .eq("learner_user_id", userId),
      ]);

    const scopedInvites = filterInvitationsForDeclaredSkills(
      (invites ?? []).map((row) => ({
        skill: (row.skill as string) ?? "",
        skillId: (row.skill_id as string | null) ?? null,
        status: row.status as string,
      })),
      skillRefs,
    );
    const scopedLegacyInvites = filterInvitationsForDeclaredSkills(
      (legacyInvites ?? []).map((row) => ({
        skill: row.skill as string,
        status: row.status as string,
      })),
      skillRefs,
    );
    const scopedReviewRequests = skillRefs.length
      ? (reviewRequests ?? []).filter((row) =>
        skillRefs.some((skill) => skill.id === (row.skill_id as string | null)),
      )
      : [];

    const pendingPeerInvites = scopedInvites.filter(
      (i) => i.status !== PEER_REVIEW_INVITE_STATUS.COMPLETED
        && i.status !== PEER_REVIEW_INVITE_STATUS.EXPIRED,
    ).length;
    const pendingLegacy = scopedLegacyInvites.filter(
      (i) => i.status !== "Completed",
    ).length;
    const pendingRequests = scopedReviewRequests.filter(
      (r) => (r.status as string) !== "completed" && (r.status as string) !== "expired",
    ).length;

    return {
      totalReviews: reviews.length,
      contextVerified: reviews.filter((r) => r.contextStatus === CONTEXT_STATUS.VERIFIED).length,
      imported: reviews.filter((r) => r.imported).length,
      fromSIJILForm: reviews.filter((r) => r.origin === "SIJIL").length,
      highTrust: reviews.filter((r) => r.trustWeight === "High Trust").length,
      pendingInvites: pendingPeerInvites + pendingLegacy + pendingRequests,
    };
  }
}

export const peerReviewService = new PeerReviewService();

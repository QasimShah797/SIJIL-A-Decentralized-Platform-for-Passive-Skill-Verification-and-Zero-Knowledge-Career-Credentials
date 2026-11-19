/**
 * Peer review service — projects, contributors, invites, submit, stats.
 * Only verified contributors of the same synced project may submit reviews.
 */
import { randomBytes } from "crypto";
import { supabaseService } from "./supabase.service";
import { walletService } from "./wallet.service";
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
import { REVIEW_REQUEST_STATUS, REVIEW_TOKEN_TTL_DAYS } from "../constants/reviews";
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
import { resolvePeerReviewDate } from "../utils/peerReviewDate";
import {
  getGitHubConnection,
  isDeliverableEmail,
  persistContributorEmail,
  resolveGitHubUserEmail,
  resolveGitHubUserEmails,
} from "../utils/githubContributorEmail";
import {
  EMAIL_DELIVERY_STATUS,
  OPEN_INVITE_LIFECYCLE,
  inviteSendDecision,
  safeSmtpFailure,
  storedDeliveryStatus,
  withTimeout,
  type EmailDeliveryStatus,
} from "../utils/invite-email-delivery";
import { isMissingColumnError, isUniqueViolation } from "../utils/supabase-errors";
import { isSmtpConfigured } from "../utils/mailer";

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

function publicContributorEmail(email: string | null | undefined): string | undefined {
  return isDeliverableEmail(email) ? email!.trim() : undefined;
}

const SMTP_SEND_TIMEOUT_MS = 20_000;

async function deliverReviewInviteEmail(
  to: string,
  learnerName: string,
  evidenceName: string,
  reviewLink: string,
  options?: { reviewerName?: string; skillName?: string },
): Promise<"sent" | "failed" | "not_sent"> {
  if (!isSmtpConfigured()) return "not_sent";
  try {
    const result = await withTimeout(
      sendReviewRequestEmail(to, learnerName, evidenceName, reviewLink, options),
      SMTP_SEND_TIMEOUT_MS,
    );
    return result.delivered ? "sent" : "not_sent";
  } catch (err) {
    console.error("[SIJIL Review Email] invitation kept category=" + safeSmtpFailure(err));
    return "failed";
  }
}

async function markEmailDelivery(
  table: "peer_review_invites" | "review_requests",
  inviteId: string,
  userId: string,
  delivery: "pending" | "sent" | "failed" | "not_sent",
): Promise<EmailDeliveryStatus> {
  const { error } = await supabaseService.client
    .from(table)
    .update({ email_delivery_status: delivery })
    .eq("id", inviteId)
    .eq("learner_user_id", userId);
  if (!error) return delivery;
  if (isMissingColumnError(error)) return "unknown";
  console.error("[SIJIL Review Email] delivery status was not stored category=" + delivery);
  return "unknown";
}

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
  assertReviewerIdentityForInvite,
  canResendStoredInvitation,
  invitationRecipient,
  normalizeEmail,
  unverifiedFeedbackLabels,
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
    skill: (row.skill as string) ?? (row.competency_name as string) ?? "",
    skillId: (row.skill_id as string | null) ?? null,
    projectId: (row.project_id as string | undefined)
      ?? (row.evidence_record_id ? `ev-${row.evidence_record_id}` : undefined),
    projectName: row.project_name as string | undefined,
    evidenceLabel: row.evidence_label as string,
    evidenceUrl: row.evidence_url as string | undefined,
    rating: row.rating as number,
    comment: row.comment as string,
    recommendation: (row.recommendation as string) ?? undefined,
    date: resolvePeerReviewDate(row),
    contextStatus: (row.context_status as string) ?? CONTEXT_STATUS.VERIFIED,
    contributorVerification: (row.contributor_verification as string) ?? undefined,
    trustWeight: (row.trust_weight as string) ?? categoricalTrustWeight(score),
    trustWeightScore: score,
    relationship,
    imported,
  };
}

function contributorMatchesReview(
  review: PeerReviewRecordView,
  contributor: { id: string; name: string; handle?: string },
): boolean {
  const handle = normalizeText(contributor.handle);
  const name = normalizeText(contributor.name);
  const reviewer = normalizeText(review.reviewerName);
  if (!reviewer) return false;
  if (handle && (reviewer === handle || reviewer === `@${handle}`)) return true;
  if (name && reviewer === name) return true;
  return false;
}

function reviewBelongsToProject(
  review: PeerReviewRecordView,
  project: ResolvedProject,
): boolean {
  if (review.projectId === project.projectId) return true;
  // Legacy rows may lack project_id; rowToPeerReview falls back to ev-{evidenceRecordId}.
  if (project.evidenceRecordId && review.projectId === `ev-${project.evidenceRecordId}`) {
    return true;
  }
  return false;
}

function reviewMatchesContributor(
  review: PeerReviewRecordView,
  project: ResolvedProject,
  contributor: { id: string; name: string; handle?: string },
): boolean {
  return contributorMatchesReview(review, contributor) && reviewBelongsToProject(review, project);
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

function contributorsSamePerson(
  a: Pick<PeerReviewContributorView, "id" | "handle" | "email">,
  b: Pick<PeerReviewContributorView, "id" | "handle" | "email">,
): boolean {
  const aLogin = normalizeText(a.handle);
  const bLogin = normalizeText(b.handle);
  if (aLogin && bLogin && aLogin === bLogin) return true;

  const aEmail = normalizeText(a.email);
  const bEmail = normalizeText(b.email);
  if (aEmail && bEmail && aEmail === bEmail) return true;

  return normalizeText(a.id) === normalizeText(b.id);
}

function mergeContributorEntries(
  existing: PeerReviewContributorView,
  incoming: PeerReviewContributorView,
  preferIncomingId: boolean,
): PeerReviewContributorView {
  return {
    ...existing,
    id: preferIncomingId ? incoming.id : existing.id,
    name: incoming.name?.trim() ? incoming.name : existing.name,
    handle: incoming.handle ?? existing.handle,
    email: incoming.email ?? existing.email,
    avatarUrl: incoming.avatarUrl ?? existing.avatarUrl,
    role: incoming.relationship !== RELATIONSHIP.CONTRIBUTOR
      ? incoming.role
      : existing.role,
    relationship: incoming.relationship !== RELATIONSHIP.CONTRIBUTOR
      ? incoming.relationship
      : existing.relationship,
    verified: true,
    reviewStatus: existing.reviewStatus ?? incoming.reviewStatus ?? "Review Pending",
  };
}

function dedupeContributors(contributors: PeerReviewContributorView[]): PeerReviewContributorView[] {
  const result: PeerReviewContributorView[] = [];

  for (const incoming of contributors) {
    const matchIdx = result.findIndex((existing) => contributorsSamePerson(existing, incoming));
    if (matchIdx < 0) {
      result.push(incoming);
      continue;
    }

    const preferIncomingId = Boolean(incoming.handle && (incoming.email || incoming.avatarUrl));
    result[matchIdx] = mergeContributorEntries(result[matchIdx], incoming, preferIncomingId);
  }

  return result;
}

async function fetchContributorsForProject(
  userId: string,
  project: ResolvedProject,
): Promise<PeerReviewContributorView[]> {
  const contributors: PeerReviewContributorView[] = [];

  if (project.evidenceRecordId) {
    const { data: contexts } = await supabaseService.client
      .from("reviewer_contexts")
      .select("*")
      .eq("evidence_record_id", project.evidenceRecordId)
      .eq("user_id", userId);

    for (const c of contexts ?? []) {
      const relationship = relationshipFromRole(c.context_role as string);
      contributors.push({
        id: c.id as string,
        name: c.reviewer_name as string,
        handle: (c.reviewer_login as string) ?? undefined,
        email: publicContributorEmail(c.reviewer_email as string | null),
        role: displayRoleForRelationship(relationship),
        relationship,
        verified: true,
        reviewStatus: "Review Pending",
      });
    }
  }

  if (project.githubRepoId != null) {
    const { data: ghContributors } = await supabaseService.client
      .from("github_repo_contributors")
      .select("*")
      .eq("user_id", userId)
      .eq("repo_id", project.githubRepoId);

    for (const c of ghContributors ?? []) {
      contributors.push({
        id: c.id as string,
        name: c.full_name as string,
        handle: c.contributor_login as string,
        email: publicContributorEmail(c.contributor_email as string | null),
        role: displayRoleForRelationship(RELATIONSHIP.CONTRIBUTOR),
        relationship: RELATIONSHIP.CONTRIBUTOR,
        avatarUrl: (c.contributor_avatar_url as string) ?? undefined,
        verified: true,
        reviewStatus: "Review Pending",
      });
    }
  }

  return dedupeContributors(contributors);
}

async function enrichContributorEmails(
  userId: string,
  project: ResolvedProject,
  contributors: PeerReviewContributorView[],
): Promise<PeerReviewContributorView[]> {
  if (project.source !== "GitHub") return contributors;

  const handles = contributors
    .map((contributor) => contributor.handle?.trim())
    .filter((handle): handle is string => Boolean(handle));
  const ghConn = handles.length ? await getGitHubConnection(userId) : null;
  if (!ghConn) {
    return contributors.map((contributor) => ({ ...contributor, email: undefined }));
  }

  const resolved = await resolveGitHubUserEmails(handles, ghConn.token, project.repoFullName);
  return contributors.map((contributor) => {
    const email = contributor.handle
      ? resolved.get(contributor.handle.toLowerCase()) ?? null
      : null;
    return { ...contributor, email: email ?? undefined };
  });
}

async function ensureContributorVerified(
  userId: string,
  project: ResolvedProject,
  contributorId: string,
  contributorEmail?: string,
): Promise<PeerReviewContributorView> {
  const contributors = await fetchContributorsForProject(userId, project);
  let contributor = contributors.find((c) => contributorIdentityMatches(c, contributorId, contributorEmail));
  if (!contributor) {
    throw new AppError("Only verified contributors of the same project can submit reviews", 403);
  }

  if (contributor.handle?.trim() && project.source === "GitHub") {
    const ghConn = await getGitHubConnection(userId);
    const email = ghConn
      ? await resolveGitHubUserEmail(contributor.handle, ghConn.token, project.repoFullName)
      : null;
    contributor = { ...contributor, email: email ?? undefined };
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

async function findPendingPeerReviewInvite(
  userId: string,
  projectId: string,
  opts: { contributorId?: string; contributorEmail?: string; inviteId?: string },
): Promise<Record<string, unknown> | null> {
  const select = "id, token, status, expires_at, contributor_id, contributor_name, contributor_email, skill_id, skill, project_id, project_name, email_delivery_status";

  const firstOpen = async (
    filter: (query: any) => any,
  ): Promise<Record<string, unknown> | null> => {
    const run = async (columns: string) => {
      const query = filter(
        supabaseService.client.from("peer_review_invites").select(columns),
      );
      const { data, error } = await query
        .in("status", [...OPEN_INVITE_LIFECYCLE])
        .order("created_at", { ascending: false })
        .limit(1);
      return { data, error };
    };
    let result = await run(select);
    if (result.error && isMissingColumnError(result.error)) {
      result = await run(select.replace(", email_delivery_status", ""));
    }
    return (result.data?.[0] as Record<string, unknown> | undefined) ?? null;
  };

  if (opts.inviteId) {
    const data = await firstOpen((query) => query
      .eq("learner_user_id", userId)
      .eq("id", opts.inviteId));
    if (data) return data;
  }

  if (opts.contributorId) {
    const data = await firstOpen((query) => query
      .eq("learner_user_id", userId)
      .eq("project_id", projectId)
      .eq("contributor_id", opts.contributorId));
    if (data) return data;
  }

  if (opts.contributorEmail) {
    const data = await firstOpen((query) => query
      .eq("learner_user_id", userId)
      .eq("project_id", projectId)
      .eq("contributor_email", opts.contributorEmail));
    if (data) return data;
  }

  return null;
}

async function resendStoredInviteEmail(input: {
  userId: string;
  inviteId: string;
  projectId: string;
  projectName: string;
  contributorName: string;
  contributorEmail: string;
  skillName: string;
  token: string;
  expiresAt: string;
  table: "peer_review_invites" | "review_requests";
  statusValue: string;
}): Promise<PeerReviewInviteResult> {
  let token = input.token;
  let reviewLink = buildReviewLink(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (
    input.table === "peer_review_invites" ? PEER_REVIEW_TOKEN_TTL_DAYS : REVIEW_TOKEN_TTL_DAYS
  ));
  const isExpired = new Date(input.expiresAt) < new Date();

  if (isExpired) {
    token = generateToken();
    reviewLink = buildReviewLink(token);
    const { error: updateError } = await supabaseService.client
      .from(input.table)
      .update({
        token,
        expires_at: expiresAt.toISOString(),
        status: input.statusValue,
      })
      .eq("id", input.inviteId)
      .eq("learner_user_id", input.userId);
    if (updateError) {
      throw new AppError(updateError.message ?? "Failed to resend review invitation", 500);
    }
  }

  if (input.table === "peer_review_invites") {
    await markEmailDelivery(input.table, input.inviteId, input.userId, EMAIL_DELIVERY_STATUS.PENDING);
  }

  const learnerName = await getLearnerName(input.userId);
  const delivered = await deliverReviewInviteEmail(
    normalizeEmail(input.contributorEmail),
    learnerName,
    input.projectName,
    reviewLink,
    {
      reviewerName: input.contributorName,
      skillName: input.skillName,
    },
  );
  if (input.table === "peer_review_invites") {
    await markEmailDelivery(input.table, input.inviteId, input.userId, delivered);
  }

  return {
    inviteId: input.inviteId,
    token,
    reviewLink,
    status: delivered === "sent" ? "resent" : "email_not_sent",
    emailDeliveryStatus: delivered,
  };
}

async function findExistingReview(
  userId: string,
  project: ResolvedProject,
  contributor: PeerReviewContributorView,
): Promise<PeerReviewRecordView | null> {
  const { data: rows } = await supabaseService.client
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .eq("project_id", project.projectId)
    .order("review_date", { ascending: false });

  const direct = (rows ?? [])
    .map((r) => rowToPeerReview(r as Record<string, unknown>))
    .find((r) => contributorMatchesReview(r, contributor));
  if (direct) return direct;

  if (!project.evidenceRecordId) return null;

  const { data: legacyRows } = await supabaseService.client
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .eq("evidence_record_id", project.evidenceRecordId)
    .is("project_id", null)
    .order("review_date", { ascending: false });

  const legacy = (legacyRows ?? [])
    .map((r) => rowToPeerReview(r as Record<string, unknown>))
    .find((r) => contributorMatchesReview(r, contributor));
  return legacy ?? null;
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
  contributorVerification?: string;
  contextStatus?: string;
}) {
  const relationship = input.contributor.relationship;
  const contextVerified = input.contextStatus === CONTEXT_STATUS.VERIFIED;
  const score = trustScoreForRelationship(relationship, contextVerified);
  const trustWeight = categoricalTrustWeight(score);
  const reviewedAt = new Date().toISOString();

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
    review_date: reviewedAt,
    reviewed_at: reviewedAt,
    review_type: input.reviewType,
    evidence_record_id: input.project.evidenceRecordId ?? null,
    skill_id: input.skillId,
      context_status: input.contextStatus ?? CONTEXT_STATUS.PENDING,
    contributor_verification: input.contributorVerification ?? CONTRIBUTOR_VERIFICATION.PENDING,
    trust_weight: trustWeight,
    trust_weight_score: score,
    relationship,
    imported: input.imported,
    external_reference: input.externalReference ?? null,
  });
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

export class PeerReviewService {
  async getProjects(userId: string): Promise<PeerReviewProjectView[]> {
    const [
      skillLinksByEvidence,
      skillRefs,
      { data: repos },
      { data: evidenceRows },
      { data: lmsRows },
      { data: ghContributorRows },
      { data: contextRows },
    ] = await Promise.all([
      getSkillLinksForUser(userId),
      fetchDeclaredSkillRefs(userId),
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
      supabaseService.client
        .from("github_repo_contributors")
        .select("id, repo_id, full_name, contributor_login, contributor_email, contributor_avatar_url")
        .eq("user_id", userId),
      supabaseService.client
        .from("reviewer_contexts")
        .select("id, evidence_record_id, reviewer_name, reviewer_login, reviewer_email, context_role")
        .eq("user_id", userId),
    ]);

    const evidenceByRepoId = new Map<number, EvidenceRow>();
    for (const row of evidenceRows ?? []) {
      const repoId = Number(row.github_repo_id ?? 0);
      if (repoId) evidenceByRepoId.set(repoId, row as EvidenceRow);
    }

    const contributorsByRepo = new Map<number, PeerReviewContributorView[]>();
    for (const row of ghContributorRows ?? []) {
      const repoId = Number(row.repo_id);
      if (!repoId) continue;
      const list = contributorsByRepo.get(repoId) ?? [];
      list.push({
        id: row.id as string,
        name: row.full_name as string,
        handle: (row.contributor_login as string) ?? undefined,
        email: (row.contributor_email as string) ?? undefined,
        role: displayRoleForRelationship(RELATIONSHIP.CONTRIBUTOR),
        relationship: RELATIONSHIP.CONTRIBUTOR,
        avatarUrl: (row.contributor_avatar_url as string) ?? undefined,
        verified: true,
        reviewStatus: "Review Pending",
      });
      contributorsByRepo.set(repoId, list);
    }

    const contextsByEvidence = new Map<string, PeerReviewContributorView[]>();
    for (const row of contextRows ?? []) {
      const evidenceId = row.evidence_record_id as string;
      if (!evidenceId) continue;
      const relationship = relationshipFromRole(row.context_role as string);
      const list = contextsByEvidence.get(evidenceId) ?? [];
      list.push({
        id: row.id as string,
        name: row.reviewer_name as string,
        handle: (row.reviewer_login as string) ?? undefined,
        email: (row.reviewer_email as string) ?? undefined,
        role: displayRoleForRelationship(relationship),
        relationship,
        verified: true,
        reviewStatus: "Review Pending",
      });
      contextsByEvidence.set(evidenceId, list);
    }

    const contributorsFor = (repoId: number | null, evidenceId?: string) => dedupeContributors([
      ...(evidenceId ? contextsByEvidence.get(evidenceId) ?? [] : []),
      ...(repoId != null ? contributorsByRepo.get(repoId) ?? [] : []),
    ]);

    const projects: PeerReviewProjectView[] = [];

    for (const repo of repos ?? []) {
      const repoId = repo.repo_id as number;
      const evidence = evidenceByRepoId.get(repoId);
      const skillLinks = evidence
        ? (skillLinksByEvidence.get(evidence.id) ?? [])
        : [];
      projects.push({
        id: `gh-${repoId}`,
        name: repo.repo_name as string,
        source: "GitHub",
        url: repo.github_url as string,
        evidenceLabel: `GitHub repo: ${repo.full_name}`,
        linkedSkills: skillLinks.length
          ? skillLinks.map((s) => s.skillName)
          : repo.linked_skill_name ? [repo.linked_skill_name as string] : [],
        contributors: contributorsFor(repoId, evidence?.id),
        evidenceRecordId: evidence?.id,
        skillLinks,
      });
    }

    for (const row of evidenceRows ?? []) {
      const repoId = Number(row.github_repo_id ?? 0);
      if (repoId && projects.some((p) => p.id === `gh-${repoId}`)) continue;
      const projectId = repoId ? `gh-${repoId}` : `ev-${row.id}`;
      const skillLinks = skillLinksByEvidence.get(row.id as string) ?? [];
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
        contributors: contributorsFor(repoId || null, row.id as string),
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

    return filterProjectsForDeclaredSkills(projects, skillRefs);
  }

  async getProjectContributors(
    userId: string,
    projectId: string,
  ): Promise<PeerReviewContributorView[]> {
    const project = await resolveProject(userId, projectId);

    let contributors = await fetchContributorsForProject(userId, project);
    contributors = await enrichContributorEmails(userId, project, contributors);

    let reviewQuery = supabaseService.client
      .from("peer_reviews")
      .select("id, reviewer_name, project_id, evidence_record_id, imported")
      .eq("learner_user_id", userId);
    reviewQuery = project.evidenceRecordId
      ? reviewQuery.or(`project_id.eq.${project.projectId},evidence_record_id.eq.${project.evidenceRecordId}`)
      : reviewQuery.eq("project_id", project.projectId);

    const reviewResult = await reviewQuery;
    const reviewRows = reviewResult.data;
    const inviteResult = await supabaseService.client
      .from("peer_review_invites")
      .select("id, contributor_id, status, completed_review_id, email_delivery_status")
      .eq("learner_user_id", userId)
      .eq("project_id", projectId);
    const legacyInvites = inviteResult.error && isMissingColumnError(inviteResult.error)
      ? await supabaseService.client
        .from("peer_review_invites")
        .select("id, contributor_id, status, completed_review_id")
        .eq("learner_user_id", userId)
        .eq("project_id", projectId)
      : null;
    const invites = (legacyInvites?.data ?? inviteResult.data) as Array<Record<string, unknown>> | null;

    const reviews = (reviewRows ?? []).map((row) => rowToPeerReview(row as Record<string, unknown>));

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
      if (invite && invite.status !== PEER_REVIEW_INVITE_STATUS.COMPLETED && invite.status !== PEER_REVIEW_INVITE_STATUS.EXPIRED) {
        const delivery = storedDeliveryStatus(invite.email_delivery_status);
        const reviewStatus = delivery === "sent"
          ? "Invite Sent"
          : delivery === "failed"
            ? "Email failed"
            : delivery === "not_sent"
              ? "Email not sent"
              : delivery === "pending"
                ? "Email pending"
                : "Delivery not confirmed";
        return {
          ...c,
          reviewStatus,
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

    const [contributor, skillResult] = await Promise.all([
      ensureContributorVerified(userId, project, input.contributorId),
      supabaseService.client
        .from("declared_skills")
        .select("id, name")
        .eq("id", input.skillId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const skill = skillResult.data;
    if (!skill) throw new AppError("Skill not found", 404);

    const recipient = invitationRecipient({
      profileEmail: contributor.email,
      requestedEmail: input.contributorEmail,
    });

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

    const resolvedPendingInvite = await findPendingPeerReviewInvite(userId, input.projectId, {
      inviteId: input.inviteId,
      contributorId: input.contributorId,
    });

    if (resolvedPendingInvite) {
      const storedInviteEmail = resolvedPendingInvite.contributor_email as string;
      const delivery = storedDeliveryStatus(resolvedPendingInvite.email_delivery_status);
      if (input.resend && !canResendStoredInvitation({
        storedInviteEmail,
        profileEmail: recipient,
      })) {
        return {
          inviteId: resolvedPendingInvite.id as string,
          token: resolvedPendingInvite.token as string,
          reviewLink: buildReviewLink(resolvedPendingInvite.token as string),
          status: "resend_blocked",
          emailDeliveryStatus: delivery,
        };
      }
      const decision = inviteSendDecision({
        existing: true,
        resend: Boolean(input.resend),
        delivery,
      });
      if (decision === "resend" && recipient) {
        const projectName = (resolvedPendingInvite.project_name as string | undefined) ?? project.name;
        return resendStoredInviteEmail({
          userId,
          inviteId: resolvedPendingInvite.id as string,
          projectId: input.projectId,
          projectName,
          contributorName: (resolvedPendingInvite.contributor_name as string) ?? contributor.name,
          contributorEmail: recipient,
          skillName: (resolvedPendingInvite.skill as string) ?? (skill.name as string),
          token: resolvedPendingInvite.token as string,
          expiresAt: resolvedPendingInvite.expires_at as string,
          table: "peer_review_invites",
          statusValue: PEER_REVIEW_INVITE_STATUS.PENDING,
        });
      }

      return {
        inviteId: resolvedPendingInvite.id as string,
        token: resolvedPendingInvite.token as string,
        reviewLink: buildReviewLink(resolvedPendingInvite.token as string),
        status: "already_invited",
        emailDeliveryStatus: delivery,
      };
    }

    if (!recipient) {
      throw new AppError(
        "Email unavailable. GitHub has not published a profile email for this contributor.",
        400,
      );
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PEER_REVIEW_TOKEN_TTL_DAYS);

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

    const inviteRow = {
      learner_user_id: userId,
      evidence_record_id: project.evidenceRecordId ?? null,
      project_id: input.projectId,
      project_name: project.name,
      source: project.source,
      contributor_id: input.contributorId,
      contributor_name: contributor.name,
      contributor_email: recipient,
      contributor_role: contributor.role,
      relationship: contributor.relationship,
      skill_id: skill.id,
      skill: skill.name,
      reviewer_context_id: reviewerContextId,
      token,
      status: PEER_REVIEW_INVITE_STATUS.PENDING,
      email_delivery_status: EMAIL_DELIVERY_STATUS.PENDING,
      expires_at: expiresAt.toISOString(),
    };
    let { data: invite, error } = await supabaseService.client
      .from("peer_review_invites")
      .insert(inviteRow)
      .select("*")
      .single();

    if (error && isMissingColumnError(error)) {
      const { email_delivery_status: _ignored, ...withoutDelivery } = inviteRow;
      const retry = await supabaseService.client
        .from("peer_review_invites")
        .insert(withoutDelivery)
        .select("*")
        .single();
      invite = retry.data;
      error = retry.error;
    }

    if (error && isUniqueViolation(error)) {
      const existing = await findPendingPeerReviewInvite(userId, input.projectId, {
        contributorId: input.contributorId,
      });
      if (existing) {
        return {
          inviteId: existing.id as string,
          token: existing.token as string,
          reviewLink: buildReviewLink(existing.token as string),
          status: "already_invited",
          emailDeliveryStatus: storedDeliveryStatus(existing.email_delivery_status),
        };
      }
    }

    if (error || !invite) {
      throw new AppError(error?.message ?? "Failed to create peer review invite", 500);
    }

    const learnerName = await getLearnerName(userId);
    const reviewLink = buildReviewLink(token);
    const delivered = await deliverReviewInviteEmail(
      recipient,
      learnerName,
      project.name,
      reviewLink,
      {
        reviewerName: contributor.name,
        skillName: skill.name as string,
      },
    );
    await markEmailDelivery("peer_review_invites", invite.id as string, userId, delivered);

    return {
      inviteId: invite.id as string,
      token,
      reviewLink,
      status: delivered === "sent" ? "created" : "email_not_sent",
      emailDeliveryStatus: delivered,
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

    const labels = unverifiedFeedbackLabels();
    const contributor: PeerReviewContributorView = {
      id: invite.contributor_id as string,
      name: invite.contributor_name as string,
      handle: verifiedContributor.handle,
      role: invite.contributor_role as string,
      relationship: (invite.relationship as Relationship) ?? RELATIONSHIP.CONTRIBUTOR,
      email: invite.contributor_email as string,
      verified: false,
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
      reviewType: "Context Pending Review",
      inviteId: invite.id as string,
      reviewerEmail: invite.contributor_email as string,
      externalReference: `sijil-invite:${invite.id as string}`,
      contributorVerification: labels.contributorVerification,
      contextStatus: labels.contextStatus,
    });

    const { data: review, error: reviewErr } = await supabaseService.client
      .from("peer_reviews")
      .insert(payload)
      .select("*")
      .single();

    if (reviewErr?.code === "23505") {
      await supabaseService.client
        .from("peer_review_invites")
        .update({ status: PEER_REVIEW_INVITE_STATUS.COMPLETED })
        .eq("id", invite.id)
        .in("status", [...OPEN_INVITE_LIFECYCLE]);
      throw new AppError("Review already submitted", 409);
    }

    if (reviewErr || !review) {
      throw new AppError(reviewErr?.message ?? "Failed to store review", 500);
    }

    const { data: claimed } = await supabaseService.client
      .from("peer_review_invites")
      .update({
        status: PEER_REVIEW_INVITE_STATUS.COMPLETED,
        completed_review_id: review.id,
      })
      .eq("id", invite.id)
      .in("status", [...OPEN_INVITE_LIFECYCLE])
      .select("id")
      .maybeSingle();

    if (!claimed) {
      await supabaseService.client.from("peer_reviews").delete().eq("id", review.id);
      throw new AppError("Review already submitted", 409);
    }

    const skillId = (invite.skill_id as string) ?? null;
    if (skillId) {
      try {
        await walletService.syncCompetency(userId, skillId);
      } catch {
        // Wallet persist is best-effort until the learner opens the wallet.
      }
    }

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
    const reviews = (data ?? [])
      .map((r) => rowToPeerReview(r as Record<string, unknown>))
      .filter((review) => {
        if (review.source === "LMS") return false;
        const source = String(review.source ?? "").toLowerCase();
        const origin = String(review.origin ?? "").toLowerCase();
        const role = String(review.reviewerRole ?? "").toLowerCase();
        return !source.includes("lms")
          && !source.includes("moodle")
          && !origin.includes("moodle")
          && !role.includes("teacher feedback")
          && !role.includes("lms instructor");
      });
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

  async resendInvitation(
    userId: string,
    invitationId: string,
    source: "peer" | "request" | "legacy",
  ): Promise<PeerReviewInviteResult> {
    if (source === "legacy") {
      throw new AppError("This older invitation cannot be resent automatically. Copy the link instead.", 400);
    }

    if (source === "request") {
      const { data: request, error } = await supabaseService.client
        .from("review_requests")
        .select(`
          id,
          token,
          status,
          expires_at,
          reviewer_name,
          reviewer_email,
          skill_id,
          evidence_record_id,
          declared_skills(name),
          evidence_records(repository_name)
        `)
        .eq("id", invitationId)
        .eq("learner_user_id", userId)
        .maybeSingle();

      if (error) throw new AppError(error.message, 500);
      if (!request) throw new AppError("Invitation not found", 404);
      if ((request.status as string) === REVIEW_REQUEST_STATUS.COMPLETED) {
        throw new AppError("This review is already completed", 409);
      }

      return {
        inviteId: request.id as string,
        token: request.token as string,
        reviewLink: buildReviewLink(request.token as string),
        status: "resend_blocked",
        emailDeliveryStatus: "not_sent",
      };
    }

    const { data: invite, error } = await supabaseService.client
      .from("peer_review_invites")
      .select("*")
      .eq("id", invitationId)
      .eq("learner_user_id", userId)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!invite) throw new AppError("Invitation not found", 404);
    if (invite.status === PEER_REVIEW_INVITE_STATUS.COMPLETED) {
      throw new AppError("This review is already completed", 409);
    }
    const delivery = storedDeliveryStatus(invite.email_delivery_status);
    if (inviteSendDecision({ existing: true, resend: true, delivery }) === "return_existing") {
      return {
        inviteId: invite.id as string,
        token: invite.token as string,
        reviewLink: buildReviewLink(invite.token as string),
        status: "already_invited",
        emailDeliveryStatus: delivery,
      };
    }

    const project = await resolveProject(userId, invite.project_id as string);
    const contributor = await ensureContributorVerified(userId, project, invite.contributor_id as string);
    if (!canResendStoredInvitation({
      storedInviteEmail: invite.contributor_email as string,
      profileEmail: contributor.email,
    })) {
      return {
        inviteId: invite.id as string,
        token: invite.token as string,
        reviewLink: buildReviewLink(invite.token as string),
        status: "resend_blocked",
        emailDeliveryStatus: delivery,
      };
    }

    return resendStoredInviteEmail({
      userId,
      inviteId: invite.id as string,
      projectId: invite.project_id as string,
      projectName: invite.project_name as string,
      contributorName: invite.contributor_name as string,
      contributorEmail: contributor.email as string,
      skillName: (invite.skill as string) ?? "Declared competency",
      token: invite.token as string,
      expiresAt: invite.expires_at as string,
      table: "peer_review_invites",
      statusValue: PEER_REVIEW_INVITE_STATUS.PENDING,
    });
  }
}

export const peerReviewService = new PeerReviewService();

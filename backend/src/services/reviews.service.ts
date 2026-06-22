/**
 * Context review service — import external reviews, eligible reviewers, requests, token submit.
 */
import { randomBytes } from "crypto";
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import {
  REVIEW_TYPE,
  REVIEW_DISPLAY_STATUS,
  REVIEW_REQUEST_STATUS,
  REVIEW_TOKEN_TTL_DAYS,
  CONTEXT_RECOMMENDATION,
} from "../constants/reviews";
import { buildReviewLink, sendReviewRequestEmail } from "../utils/reviewEmail";
import { withPeerReviewUserColumns } from "../utils/peerReviewInsert";
import {
  importGitHubReviewsForEvidence,
  importGitHubReviewsForProject,
  resolveGitHubImportTarget,
  syncContributorsForRepo,
} from "./github-review-import.service";
import {
  relationshipFromRole,
  categoricalTrustWeight,
  trustScoreForRelationship,
  displayRoleForRelationship,
  CONTEXT_STATUS,
  CONTRIBUTOR_VERIFICATION,
  PEER_REVIEW_INVITE_STATUS,
} from "../constants/peer-review";
import type { Relationship } from "../constants/peer-review";
import type {
  ContextReviewView,
  CreateReviewRequestInput,
  EligibleReviewerView,
  EvidenceReviewSummary,
  ImportExternalResult,
  ReviewRequestFormView,
  SubmitContextReviewInput,
} from "../types/reviews.types";

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

function reviewTrustFields(reviewerRole: string, contextVerified = true) {
  const relationship = relationshipFromRole(reviewerRole);
  const score = trustScoreForRelationship(relationship, contextVerified);
  return {
    reviewer_role: displayRoleForRelationship(relationship),
    relationship,
    trust_weight_score: score,
    trust_weight: categoricalTrustWeight(score),
  };
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function rowToReview(row: Record<string, unknown>): ContextReviewView {
  return {
    id: row.id as string,
    reviewType: (row.review_type as string) ?? REVIEW_TYPE.VERIFIED,
    reviewerName: row.reviewer_name as string,
    reviewerRole: row.reviewer_role as string,
    source: row.source as string,
    skillName: row.skill as string,
    rating: row.rating as number,
    comment: row.comment as string,
    recommendation: (row.recommendation as string) ?? null,
    externalReference: (row.external_reference as string) ?? null,
    reviewDate: row.review_date as string,
  };
}

function computeDisplayStatus(
  reviews: ContextReviewView[],
  pendingRequest: EvidenceReviewSummary["pendingRequest"],
): string {
  if (reviews.some((r) => r.reviewType === REVIEW_TYPE.VERIFIED)) {
    return REVIEW_DISPLAY_STATUS.VERIFIED;
  }
  if (reviews.some((r) => r.reviewType === REVIEW_TYPE.IMPORTED)) {
    return REVIEW_DISPLAY_STATUS.IMPORTED;
  }
  if (pendingRequest) {
    return pendingRequest.status === REVIEW_REQUEST_STATUS.SENT
      ? REVIEW_DISPLAY_STATUS.REQUEST_SENT
      : REVIEW_DISPLAY_STATUS.AWAITING;
  }
  return REVIEW_DISPLAY_STATUS.NO_EXTERNAL;
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

async function getGitHubToken(userId: string): Promise<{ token: string; username: string } | null> {
  const { data } = await supabaseService.client
    .from("github_connections")
    .select("access_token, github_username")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token) return null;
  return {
    token: data.access_token as string,
    username: data.github_username as string,
  };
}

export class ReviewsService {
  async importExternalForEvidence(userId: string, evidenceId: string): Promise<ImportExternalResult> {
    const target = await resolveGitHubImportTarget(userId, { evidenceId });
    if (!target) throw new AppError("Evidence not found", 404);

    let imported = 0;
    if (target.source === "GitHub") {
      const ghConn = await getGitHubToken(userId);
      if (ghConn) {
        imported = await importGitHubReviewsForEvidence(userId, target, ghConn);
      }
    }

    return { evidenceId, imported, projectId: target.github_repo_id ? `gh-${target.github_repo_id}` : undefined };
  }

  async importExternalForProject(userId: string, projectId: string): Promise<ImportExternalResult> {
    const target = await resolveGitHubImportTarget(userId, { projectId });
    if (!target) throw new AppError("Synced GitHub project not found", 404);

    const ghConn = await getGitHubToken(userId);
    if (!ghConn) throw new AppError("GitHub connection required for import", 400);

    const imported = await importGitHubReviewsForProject(userId, projectId, ghConn);
    return {
      evidenceId: target.evidence_record_id ?? projectId,
      projectId,
      imported,
    };
  }

  async importExternalForUser(userId: string): Promise<ImportExternalResult[]> {
    const ghConn = await getGitHubToken(userId);
    if (!ghConn) return [];

    const { data: records } = await supabaseService.client
      .from("evidence_records")
      .select("id, user_id, source, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
      .eq("user_id", userId)
      .eq("source", "GitHub");

    const results: ImportExternalResult[] = [];
    for (const row of records ?? []) {
      try {
        const target = await resolveGitHubImportTarget(userId, { evidenceId: row.id as string });
        if (!target) continue;
        const imported = await importGitHubReviewsForEvidence(userId, target, ghConn);
        results.push({
          evidenceId: row.id as string,
          projectId: target.github_repo_id ? `gh-${target.github_repo_id}` : undefined,
          imported,
        });
      } catch {
        // Continue with other synced repositories.
      }
    }

    const { data: repos } = await supabaseService.client
      .from("github_repos")
      .select("repo_id")
      .eq("user_id", userId);

    const seen = new Set(results.map((r) => r.projectId));
    for (const row of repos ?? []) {
      const projectId = `gh-${row.repo_id}`;
      if (seen.has(projectId)) continue;
      try {
        const imported = await importGitHubReviewsForProject(userId, projectId, ghConn);
        if (imported > 0) {
          results.push({ evidenceId: projectId, projectId, imported });
        }
      } catch {
        // Continue.
      }
    }
    return results;
  }

  async getEvidenceReviewSummary(userId: string, evidenceId: string): Promise<EvidenceReviewSummary> {
    await getEvidenceForUser(userId, evidenceId);

    const { data: reviews } = await supabaseService.client
      .from("peer_reviews")
      .select("*")
      .eq("evidence_record_id", evidenceId)
      .eq("learner_user_id", userId)
      .order("review_date", { ascending: false });

    const { data: requests } = await supabaseService.client
      .from("review_requests")
      .select("*")
      .eq("evidence_record_id", evidenceId)
      .eq("learner_user_id", userId)
      .in("status", [REVIEW_REQUEST_STATUS.SENT, REVIEW_REQUEST_STATUS.AWAITING])
      .order("created_at", { ascending: false })
      .limit(1);

    const reviewViews = (reviews ?? []).map((r) => rowToReview(r as Record<string, unknown>));
    const req = requests?.[0] as Record<string, unknown> | undefined;
    const pendingRequest = req
      ? {
          id: req.id as string,
          status: req.status as string,
          reviewerName: req.reviewer_name as string,
          reviewerEmail: req.reviewer_email as string,
          sentAt: req.created_at as string,
        }
      : null;

    return {
      evidenceId,
      displayStatus: computeDisplayStatus(reviewViews, pendingRequest),
      reviews: reviewViews,
      pendingRequest,
    };
  }

  async getEligibleReviewers(userId: string, evidenceId: string): Promise<EligibleReviewerView[]> {
    const target = await resolveGitHubImportTarget(userId, { evidenceId });

    if (target?.source === "GitHub") {
      const ghConn = await getGitHubToken(userId);
      if (ghConn) {
        await syncContributorsForRepo(userId, target, ghConn);
      }
    }

    const { data: contexts } = await supabaseService.client
      .from("reviewer_contexts")
      .select("*")
      .eq("evidence_record_id", evidenceId)
      .eq("user_id", userId);

    return (contexts ?? []).map((c) => ({
      id: c.id as string,
      name: c.reviewer_name as string,
      email: (c.reviewer_email as string) ?? null,
      login: (c.reviewer_login as string) ?? null,
      contextRole: c.context_role as string,
      source: c.source as string,
    }));
  }

  async createReviewRequest(
    userId: string,
    input: CreateReviewRequestInput,
  ): Promise<{ requestId: string; token: string; reviewLink: string; status: string }> {
    const evidence = await getEvidenceForUser(userId, input.evidenceId);

    const summary = await this.getEvidenceReviewSummary(userId, input.evidenceId);
    if (
      summary.displayStatus === REVIEW_DISPLAY_STATUS.IMPORTED
      || summary.displayStatus === REVIEW_DISPLAY_STATUS.VERIFIED
      || summary.pendingRequest
    ) {
      throw new AppError("A review already exists or a request is pending for this evidence", 409);
    }

    const { data: context } = await supabaseService.client
      .from("reviewer_contexts")
      .select("*")
      .eq("id", input.reviewerContextId)
      .eq("evidence_record_id", input.evidenceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!context) throw new AppError("Reviewer is not eligible for this evidence context", 403);

    const { data: skill } = await supabaseService.client
      .from("declared_skills")
      .select("id, name")
      .eq("id", input.skillId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!skill) throw new AppError("Skill not found", 404);

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REVIEW_TOKEN_TTL_DAYS);

    const { data: request, error } = await supabaseService.client
      .from("review_requests")
      .insert({
        learner_user_id: userId,
        evidence_record_id: input.evidenceId,
        skill_id: input.skillId,
        reviewer_context_id: input.reviewerContextId,
        reviewer_name: context.reviewer_name,
        reviewer_email: input.reviewerEmail.trim().toLowerCase(),
        reviewer_context_role: context.context_role,
        context_source: evidence.source,
        token,
        status: REVIEW_REQUEST_STATUS.AWAITING,
        expires_at: expiresAt.toISOString(),
      })
      .select("*")
      .single();

    if (error || !request) throw new AppError(error?.message ?? "Failed to create review request", 500);

    const { data: profile } = await supabaseService.client
      .from("learner_profiles")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();

    const learnerName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"
      : "Learner";
    const reviewLink = buildReviewLink(token);

    await sendReviewRequestEmail(
      input.reviewerEmail,
      learnerName,
      evidence.repository_name,
      reviewLink,
    );

    return {
      requestId: request.id as string,
      token,
      reviewLink,
      status: REVIEW_DISPLAY_STATUS.AWAITING,
    };
  }

  async getReviewRequestByToken(token: string): Promise<ReviewRequestFormView> {
    const { data: request } = await supabaseService.client
      .from("review_requests")
      .select(`
        *,
        evidence_records(repository_name, source),
        declared_skills(name)
      `)
      .eq("token", token)
      .maybeSingle();

    if (!request) {
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
      const { data: profile } = await supabaseService.client
        .from("learner_profiles")
        .select("first_name, last_name")
        .eq("user_id", invite.learner_user_id)
        .maybeSingle();
      const learnerName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"
        : "Learner";
      return {
        token,
        status: invite.status as string,
        learnerName,
        skillClaim: invite.skill as string,
        evidenceName: invite.project_name as string,
        contextSource: invite.source as string,
        reviewerContext: displayRoleForRelationship(
          (invite.relationship as Relationship) ?? "contributor",
        ),
        reviewerName: invite.contributor_name as string,
        expiresAt: invite.expires_at as string,
      };
    }

    if (request.status === REVIEW_REQUEST_STATUS.COMPLETED) {
      throw new AppError("This review has already been submitted", 410);
    }

    if (new Date(request.expires_at as string) < new Date()) {
      await supabaseService.client
        .from("review_requests")
        .update({ status: REVIEW_REQUEST_STATUS.EXPIRED })
        .eq("id", request.id);
      throw new AppError("Review link has expired", 410);
    }

    const { data: profile } = await supabaseService.client
      .from("learner_profiles")
      .select("first_name, last_name")
      .eq("user_id", request.learner_user_id)
      .maybeSingle();

    const learnerName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"
      : "Learner";

    const evidence = request.evidence_records as { repository_name: string; source: string } | null;
    const skill = request.declared_skills as { name: string } | null;

    return {
      token,
      status: request.status as string,
      learnerName,
      skillClaim: skill?.name ?? "Skill claim",
      evidenceName: evidence?.repository_name ?? "Project evidence",
      contextSource: evidence?.source ?? (request.context_source as string),
      reviewerContext: request.reviewer_context_role as string,
      reviewerName: request.reviewer_name as string,
      expiresAt: request.expires_at as string,
    };
  }

  async submitReviewByToken(token: string, input: SubmitContextReviewInput): Promise<ContextReviewView> {
    const { data: invite } = await supabaseService.client
      .from("peer_review_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (invite) {
      const { peerReviewService } = await import("./peer-review.service");
      const review = await peerReviewService.submitReview({
        token,
        rating: input.rating,
        feedback: input.feedback,
        recommendation: input.recommendation,
      });
      return {
        id: review.id,
        reviewType: "Context Verified Review",
        reviewerName: review.reviewerName,
        reviewerRole: review.reviewerRole,
        source: review.source,
        skillName: review.skill,
        rating: review.rating,
        comment: review.comment,
        recommendation: review.recommendation ?? null,
        externalReference: null,
        reviewDate: review.date,
      };
    }

    const { data: request } = await supabaseService.client
      .from("review_requests")
      .select(`
        *,
        evidence_records(id, repository_name, repository_url, source),
        declared_skills(id, name)
      `)
      .eq("token", token)
      .maybeSingle();

    if (!request) throw new AppError("Review link is invalid", 404);
    if (request.status === REVIEW_REQUEST_STATUS.COMPLETED) {
      throw new AppError("Review already submitted", 409);
    }
    if (new Date(request.expires_at as string) < new Date()) {
      throw new AppError("Review link has expired", 410);
    }

    if (request.reviewer_context_id) {
      const { data: ctx } = await supabaseService.client
        .from("reviewer_contexts")
        .select("id")
        .eq("id", request.reviewer_context_id)
        .maybeSingle();
      if (!ctx) throw new AppError("Reviewer context could not be verified", 403);
    }

    const evidence = request.evidence_records as {
      id: string;
      repository_name: string;
      repository_url: string;
      source: string;
    } | null;
    const skill = request.declared_skills as { id: string; name: string } | null;

    const trust = reviewTrustFields(request.reviewer_context_role as string);
    const { data: review, error: reviewErr } = await supabaseService.client
      .from("peer_reviews")
      .insert(withPeerReviewUserColumns({
        learner_user_id: request.learner_user_id,
        reviewer_name: request.reviewer_name,
        reviewer_email: request.reviewer_email,
        ...trust,
        source: evidence?.source ?? (request.context_source as string),
        origin: "SIJIL",
        skill: skill?.name ?? "General",
        project_id: evidence?.id ? `ev-${evidence.id}` : undefined,
        project_name: evidence?.repository_name,
        evidence_label: `${evidence?.repository_name ?? "Evidence"} (${evidence?.source ?? "Context"})`,
        evidence_url: evidence?.repository_url,
        rating: input.rating,
        comment: input.feedback,
        recommendation: input.recommendation,
        review_type: REVIEW_TYPE.VERIFIED,
        evidence_record_id: evidence?.id ?? request.evidence_record_id,
        skill_id: skill?.id ?? request.skill_id,
        review_request_id: request.id,
        context_status: CONTEXT_STATUS.VERIFIED,
        contributor_verification: CONTRIBUTOR_VERIFICATION.VERIFIED,
        imported: false,
      }))
      .select("*")
      .single();

    if (reviewErr || !review) {
      throw new AppError(reviewErr?.message ?? "Failed to store review", 500);
    }

    await supabaseService.client
      .from("review_requests")
      .update({
        status: REVIEW_REQUEST_STATUS.COMPLETED,
        completed_review_id: review.id,
      })
      .eq("id", request.id);

    return rowToReview(review as Record<string, unknown>);
  }
}

export const reviewsService = new ReviewsService();

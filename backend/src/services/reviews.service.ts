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
import type {
  ContextReviewView,
  CreateReviewRequestInput,
  EligibleReviewerView,
  EvidenceReviewSummary,
  ImportExternalResult,
  ReviewRequestFormView,
  SubmitContextReviewInput,
} from "../types/reviews.types";

const GH = "https://api.github.com";

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

async function syncContributorsForRepo(
  userId: string,
  evidence: EvidenceRow,
  ghConn: { token: string; username: string },
): Promise<void> {
  const repoId = evidence.github_repo_id;
  const fullName = evidence.repo_full_name
    ?? (evidence.metadata?.full_name as string | undefined);
  if (!repoId || !fullName) return;

  const ghHeaders = {
    Authorization: `Bearer ${ghConn.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-backend",
  };

  try {
    const resp = await fetch(`${GH}/repos/${fullName}/contributors?per_page=30`, { headers: ghHeaders });
    if (!resp.ok) return;
    const contributors = await resp.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(contributors)) return;

    const contributorRows = contributors.map((c) => ({
      user_id: userId,
      repo_id: repoId,
      full_name: (c.login as string) ?? "Contributor",
      github_url: evidence.repository_url,
      contributor_login: c.login as string,
      contributor_avatar_url: (c.avatar_url as string) ?? null,
      contributor_html_url: (c.html_url as string) ?? null,
      contributions: (c.contributions as number) ?? 0,
      synced_at: new Date().toISOString(),
    }));

    if (contributorRows.length) {
      await supabaseService.client
        .from("github_repo_contributors")
        .upsert(contributorRows, { onConflict: "user_id,repo_id,contributor_login" });
    }

    const contextRows = contributors
      .filter((c) => (c.login as string)?.toLowerCase() !== ghConn.username.toLowerCase())
      .map((c) => ({
        evidence_record_id: evidence.id,
        user_id: userId,
        reviewer_name: (c.login as string) ?? "Contributor",
        reviewer_login: c.login as string,
        context_role: "Same repo contributor",
        source: evidence.source,
        external_ref: `github:contributor:${c.login}`,
        synced_at: new Date().toISOString(),
      }));

    if (contextRows.length) {
      await supabaseService.client
        .from("reviewer_contexts")
        .upsert(contextRows, { onConflict: "evidence_record_id,reviewer_login" });
    }
  } catch {
    // Best-effort contributor sync.
  }
}

async function insertImportedReview(
  row: Record<string, unknown>,
): Promise<boolean> {
  const { error: insErr } = await supabaseService.client.from("peer_reviews").insert(row);
  if (insErr && process.env.NODE_ENV === "development") {
    console.warn("[SIJIL review import] insert failed:", insErr.message);
  }
  return !insErr;
}

async function importGitHubExternalReviews(
  userId: string,
  evidence: EvidenceRow,
  ghConn: { token: string; username: string },
): Promise<number> {
  const fullName = evidence.repo_full_name
    ?? (evidence.metadata?.full_name as string | undefined);
  if (!fullName) return 0;

  const ghHeaders = {
    Authorization: `Bearer ${ghConn.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-backend",
  };

  const learnerLogin = ghConn.username.toLowerCase();

  const { data: skillLinks } = await supabaseService.client
    .from("skill_evidence_links")
    .select("skill_id, declared_skills(name)")
    .eq("evidence_record_id", evidence.id)
    .eq("user_id", userId)
    .limit(1);

  const skillLink = skillLinks?.[0] as {
    skill_id: string;
    declared_skills: { name: string } | { name: string }[] | null;
  } | undefined;
  const skillId = skillLink?.skill_id ?? null;
  const skillName = skillLink?.declared_skills
    ? (Array.isArray(skillLink.declared_skills)
      ? skillLink.declared_skills[0]?.name
      : skillLink.declared_skills.name)
    : "General";

  const { data: existing } = await supabaseService.client
    .from("peer_reviews")
    .select("external_reference")
    .eq("evidence_record_id", evidence.id)
    .eq("learner_user_id", userId);

  const existingRefs = new Set(
    (existing ?? [])
      .map((r) => r.external_reference as string)
      .filter(Boolean),
  );
  let imported = 0;

  const baseReview = {
    learner_user_id: userId,
    source: evidence.source,
    origin: "GitHub",
    skill: skillName ?? "General",
    project_id: String(evidence.github_repo_id ?? evidence.id),
    project_name: evidence.repository_name,
    review_type: REVIEW_TYPE.IMPORTED,
    evidence_record_id: evidence.id,
    skill_id: skillId,
    context_status: "Imported Context Review",
    imported: true,
  };

  try {
    const prResp = await fetch(
      `${GH}/repos/${fullName}/pulls?state=all&per_page=30&sort=updated&direction=desc`,
      { headers: ghHeaders },
    );
    if (!prResp.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[SIJIL review import] pulls fetch failed for ${fullName}: ${prResp.status}`);
      }
      return 0;
    }
    const pulls = await prResp.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(pulls)) return 0;

    for (const pr of pulls) {
      const prNumber = pr.number as number;
      const prAuthor = (pr.user as { login?: string } | undefined)?.login?.toLowerCase() ?? "";
      const prUrl = (pr.html_url as string) ?? evidence.repository_url;

      // Official PR reviews (approve / request changes / comment)
      const reviewsResp = await fetch(
        `${GH}/repos/${fullName}/pulls/${prNumber}/reviews`,
        { headers: ghHeaders },
      );
      if (reviewsResp.ok) {
        const reviews = await reviewsResp.json() as Array<Record<string, unknown>>;
        if (Array.isArray(reviews)) {
          for (const rv of reviews) {
            const reviewer = rv.user as { login?: string } | undefined;
            const reviewerLogin = reviewer?.login?.toLowerCase() ?? "";
            if (!reviewerLogin || reviewerLogin === learnerLogin) continue;

            const extRef = `github:pr-review:${fullName}#${prNumber}:${rv.id}`;
            if (existingRefs.has(extRef)) continue;

            const state = (rv.state as string) ?? "COMMENTED";
            const body = (rv.body as string) ?? "";
            if (!body.trim() && state === "COMMENTED") continue;

            const recommendation = state === "APPROVED"
              ? CONTEXT_RECOMMENDATION.SUPPORT
              : state === "CHANGES_REQUESTED"
                ? CONTEXT_RECOMMENDATION.NEEDS_MORE
                : CONTEXT_RECOMMENDATION.NOT_ENOUGH;

            const ok = await insertImportedReview({
              ...baseReview,
              reviewer_name: reviewer!.login!,
              reviewer_role: prAuthor === learnerLogin ? "Same repo contributor" : "Repo collaborator",
              evidence_label: `${evidence.repository_name} — PR #${prNumber}${prAuthor ? ` by @${prAuthor}` : ""}`,
              evidence_url: prUrl,
              rating: state === "APPROVED" ? 4 : state === "CHANGES_REQUESTED" ? 2 : 3,
              comment: body.trim() || `GitHub PR review: ${state}`,
              recommendation,
              external_reference: extRef,
            });

            if (ok) {
              existingRefs.add(extRef);
              imported += 1;
            }
          }
        }
      }

      // PR conversation comments (timeline — often where approval text lives)
      const issueCommentsResp = await fetch(
        `${GH}/repos/${fullName}/issues/${prNumber}/comments?per_page=30`,
        { headers: ghHeaders },
      );
      if (issueCommentsResp.ok) {
        const issueComments = await issueCommentsResp.json() as Array<Record<string, unknown>>;
        if (Array.isArray(issueComments)) {
          for (const cm of issueComments) {
            const author = cm.user as { login?: string } | undefined;
            const authorLogin = author?.login?.toLowerCase() ?? "";
            if (!authorLogin || authorLogin === learnerLogin) continue;

            const extRef = `github:issue-comment:${fullName}#${prNumber}:${cm.id}`;
            if (existingRefs.has(extRef)) continue;
            const body = (cm.body as string) ?? "";
            if (!body.trim()) continue;
            if (/^approved these changes/i.test(body.trim())) continue;

            const ok = await insertImportedReview({
              ...baseReview,
              reviewer_name: author!.login!,
              reviewer_role: "Same repo contributor",
              evidence_label: `${evidence.repository_name} — PR #${prNumber} comment`,
              evidence_url: (cm.html_url as string) ?? prUrl,
              rating: 3,
              comment: body,
              recommendation: CONTEXT_RECOMMENDATION.SUPPORT,
              external_reference: extRef,
            });

            if (ok) {
              existingRefs.add(extRef);
              imported += 1;
            }
          }
        }
      }

      // Inline code review comments on the PR diff
      const commentsResp = await fetch(
        `${GH}/repos/${fullName}/pulls/${prNumber}/comments?per_page=30`,
        { headers: ghHeaders },
      );
      if (commentsResp.ok) {
        const comments = await commentsResp.json() as Array<Record<string, unknown>>;
        if (Array.isArray(comments)) {
          for (const cm of comments) {
            const author = cm.user as { login?: string } | undefined;
            const authorLogin = author?.login?.toLowerCase() ?? "";
            if (!authorLogin || authorLogin === learnerLogin) continue;

            const extRef = `github:pr-comment:${fullName}#${prNumber}:${cm.id}`;
            if (existingRefs.has(extRef)) continue;
            const body = (cm.body as string) ?? "";
            if (!body.trim()) continue;

            const ok = await insertImportedReview({
              ...baseReview,
              reviewer_name: author!.login!,
              reviewer_role: "Same repo contributor",
              evidence_label: `${evidence.repository_name} — PR #${prNumber} review comment`,
              evidence_url: (cm.html_url as string) ?? prUrl,
              rating: 3,
              comment: body,
              recommendation: CONTEXT_RECOMMENDATION.SUPPORT,
              external_reference: extRef,
            });

            if (ok) {
              existingRefs.add(extRef);
              imported += 1;
            }
          }
        }
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[SIJIL review import] error:", err);
    }
  }

  return imported;
}

export class ReviewsService {
  async importExternalForEvidence(userId: string, evidenceId: string): Promise<ImportExternalResult> {
    const evidence = await getEvidenceForUser(userId, evidenceId);
    let imported = 0;

    if (evidence.source === "GitHub") {
      const ghConn = await getGitHubToken(userId);
      if (ghConn) {
        await syncContributorsForRepo(userId, evidence, ghConn);
        imported = await importGitHubExternalReviews(userId, evidence, ghConn);
      }
    }

    return { evidenceId, imported };
  }

  async importExternalForUser(userId: string): Promise<ImportExternalResult[]> {
    const { data: records } = await supabaseService.client
      .from("evidence_records")
      .select("id")
      .eq("user_id", userId);

    const results: ImportExternalResult[] = [];
    for (const row of records ?? []) {
      try {
        const result = await this.importExternalForEvidence(userId, row.id as string);
        results.push(result);
      } catch {
        // Continue with other evidence records.
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
    const evidence = await getEvidenceForUser(userId, evidenceId);

    if (evidence.source === "GitHub") {
      const ghConn = await getGitHubToken(userId);
      if (ghConn) {
        await syncContributorsForRepo(userId, evidence, ghConn);
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

    if (!request) throw new AppError("Review link is invalid or expired", 404);

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

    const { data: review, error: reviewErr } = await supabaseService.client
      .from("peer_reviews")
      .insert({
        learner_user_id: request.learner_user_id,
        reviewer_name: request.reviewer_name,
        reviewer_role: request.reviewer_context_role,
        source: evidence?.source ?? (request.context_source as string),
        origin: "SIJIL",
        skill: skill?.name ?? "General",
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
        context_status: "Context Verified Review",
        contributor_verification: "Context Verified",
        imported: false,
      })
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

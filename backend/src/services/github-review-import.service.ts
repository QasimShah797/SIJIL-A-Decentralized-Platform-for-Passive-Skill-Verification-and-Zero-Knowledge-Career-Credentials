/**
 * Import GitHub PR reviews, review comments, and issue comments via REST API.
 * Only stores feedback from verified repo contributors (excluding the learner).
 */
import { supabaseService } from "./supabase.service";
import { REVIEW_TYPE, CONTEXT_RECOMMENDATION } from "../constants/reviews";
import { REVIEW_SOURCE } from "../constants/review-source";
import {
  relationshipFromRole,
  categoricalTrustWeight,
  trustScoreForRelationship,
  displayRoleForRelationship,
  CONTEXT_STATUS,
  CONTRIBUTOR_VERIFICATION,
} from "../constants/peer-review";
import { withPeerReviewUserColumns } from "../utils/peerReviewInsert";
import {
  resolveGitHubUserEmail,
} from "../utils/githubContributorEmail";

const GH = "https://api.github.com";

export type GitHubImportTarget = {
  user_id: string;
  evidence_record_id: string | null;
  source: string;
  repository_name: string;
  repository_url: string;
  repo_full_name: string | null;
  github_repo_id: number;
  metadata: Record<string, unknown> | null;
  linked_skill_name?: string | null;
};

/** @deprecated use GitHubImportTarget */
export type GitHubEvidenceRow = GitHubImportTarget & { id: string };

type GitHubConnection = { token: string; username: string };

type ImportableReview = {
  externalReference: string;
  reviewerLogin: string;
  body: string;
  evidenceLabel: string;
  evidenceUrl: string;
  rating: number;
  recommendation: string;
  kind: "pr-review" | "pr-comment" | "issue-comment";
  prNumber: number;
  reviewState?: string;
  reviewDate: string;
};

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-backend",
  };
}

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

async function insertImportedReview(row: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseService.client
    .from("peer_reviews")
    .insert(withPeerReviewUserColumns(row));
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[SIJIL GitHub import] insert failed:", error.message);
  }
  return !error;
}

/** Sync repo contributors from GitHub REST → github_repo_contributors + reviewer_contexts. */
export async function syncContributorsForRepo(
  userId: string,
  target: GitHubImportTarget,
  ghConn: GitHubConnection,
): Promise<Set<string>> {
  const repoId = target.github_repo_id;
  const fullName = target.repo_full_name
    ?? (target.metadata?.full_name as string | undefined);
  const logins = new Set<string>();
  if (!repoId || !fullName) return logins;

  try {
    const resp = await fetch(
      `${GH}/repos/${fullName}/contributors?per_page=100`,
      { headers: ghHeaders(ghConn.token) },
    );
    if (!resp.ok) return logins;

    const contributors = await resp.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(contributors)) return logins;

    const learnerLogin = ghConn.username.toLowerCase();
    const emailByLogin = new Map<string, string | null>();

    for (const c of contributors) {
      const login = (c.login as string) ?? "";
      if (!login || login.toLowerCase() === learnerLogin) continue;
      const email = await resolveGitHubUserEmail(login, ghConn.token, fullName);
      emailByLogin.set(login.toLowerCase(), email);
    }

    const contributorRows = contributors.map((c) => {
      const login = (c.login as string) ?? "";
      if (login) logins.add(login.toLowerCase());
      const resolvedEmail = emailByLogin.get(login.toLowerCase()) ?? null;
      return {
        user_id: userId,
        repo_id: repoId,
        full_name: login || "Contributor",
        github_url: target.repository_url,
        contributor_login: login,
        contributor_avatar_url: (c.avatar_url as string) ?? null,
        contributor_html_url: (c.html_url as string) ?? null,
        contributor_email: resolvedEmail,
        contributions: (c.contributions as number) ?? 0,
        synced_at: new Date().toISOString(),
      };
    });

    if (contributorRows.length) {
      await supabaseService.client
        .from("github_repo_contributors")
        .upsert(contributorRows, { onConflict: "user_id,repo_id,contributor_login" });
    }

    const contextRows = contributors
      .filter((c) => {
        const login = (c.login as string)?.toLowerCase() ?? "";
        return login && login !== learnerLogin;
      })
      .map((c) => {
        const login = (c.login as string) ?? "";
        const resolvedEmail = emailByLogin.get(login.toLowerCase()) ?? null;
        return {
          evidence_record_id: target.evidence_record_id,
          user_id: userId,
          reviewer_name: login || "Contributor",
          reviewer_login: login,
          reviewer_email: resolvedEmail,
          context_role: "Same repo contributor",
          source: target.source,
          external_ref: `github:contributor:${login}`,
          synced_at: new Date().toISOString(),
        };
      });

    if (contextRows.length && target.evidence_record_id) {
      await supabaseService.client
        .from("reviewer_contexts")
        .upsert(contextRows, { onConflict: "evidence_record_id,reviewer_login" });
    }
  } catch {
    // Best-effort contributor sync.
  }

  return logins;
}

async function loadContributorLogins(
  userId: string,
  repoId: number,
  evidenceRecordId: string | null,
): Promise<Set<string>> {
  const logins = new Set<string>();

  const { data: fromRepo } = await supabaseService.client
    .from("github_repo_contributors")
    .select("contributor_login")
    .eq("user_id", userId)
    .eq("repo_id", repoId);

  for (const row of fromRepo ?? []) {
    const login = (row.contributor_login as string)?.toLowerCase();
    if (login) logins.add(login);
  }

  if (evidenceRecordId) {
    const { data: fromContext } = await supabaseService.client
      .from("reviewer_contexts")
      .select("reviewer_login")
      .eq("user_id", userId)
      .eq("evidence_record_id", evidenceRecordId);

    for (const row of fromContext ?? []) {
      const login = (row.reviewer_login as string)?.toLowerCase();
      if (login) logins.add(login);
    }
  }

  return logins;
}

function isVerifiedContributor(
  reviewerLogin: string,
  contributors: Set<string>,
  learnerLogin: string,
): boolean {
  const normalized = reviewerLogin.toLowerCase();
  if (!normalized || normalized === learnerLogin) return false;
  return contributors.has(normalized);
}

async function fetchPullRequests(
  fullName: string,
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const resp = await fetch(
    `${GH}/repos/${fullName}/pulls?state=all&per_page=30&sort=updated&direction=desc`,
    { headers: ghHeaders(token) },
  );
  if (!resp.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[SIJIL GitHub import] pulls fetch failed for ${fullName}: ${resp.status}`);
    }
    return [];
  }
  const pulls = await resp.json();
  return Array.isArray(pulls) ? pulls as Array<Record<string, unknown>> : [];
}

async function collectReviewsForPullRequest(
  fullName: string,
  prNumber: number,
  prUrl: string,
  repoName: string,
  token: string,
): Promise<ImportableReview[]> {
  const items: ImportableReview[] = [];
  const headers = ghHeaders(token);

  // 2. Pull request reviews (approve / request changes / comment)
  const reviewsResp = await fetch(
    `${GH}/repos/${fullName}/pulls/${prNumber}/reviews`,
    { headers },
  );
  if (reviewsResp.ok) {
    const reviews = await reviewsResp.json() as Array<Record<string, unknown>>;
    if (Array.isArray(reviews)) {
      for (const rv of reviews) {
        const reviewer = rv.user as { login?: string } | undefined;
        const reviewerLogin = reviewer?.login ?? "";
        if (!reviewerLogin) continue;

        const state = (rv.state as string) ?? "COMMENTED";
        const body = (rv.body as string) ?? "";
        if (!body.trim() && state === "COMMENTED") continue;

        items.push({
          externalReference: `github:pr-review:${fullName}#${prNumber}:${rv.id}`,
          reviewerLogin,
          body: body.trim() || `GitHub PR review: ${state}`,
          evidenceLabel: `${repoName} — PR #${prNumber} review`,
          evidenceUrl: prUrl,
          rating: state === "APPROVED" ? 4 : state === "CHANGES_REQUESTED" ? 2 : 3,
          recommendation: state === "APPROVED"
            ? CONTEXT_RECOMMENDATION.SUPPORT
            : state === "CHANGES_REQUESTED"
              ? CONTEXT_RECOMMENDATION.NEEDS_MORE
              : CONTEXT_RECOMMENDATION.NOT_ENOUGH,
          kind: "pr-review",
          prNumber,
          reviewState: state,
          reviewDate: (rv.submitted_at as string) ?? new Date().toISOString(),
        });
      }
    }
  }

  // 3. Pull request review comments (inline diff comments)
  const prCommentsResp = await fetch(
    `${GH}/repos/${fullName}/pulls/${prNumber}/comments?per_page=100`,
    { headers },
  );
  if (prCommentsResp.ok) {
    const comments = await prCommentsResp.json() as Array<Record<string, unknown>>;
    if (Array.isArray(comments)) {
      for (const cm of comments) {
        const author = cm.user as { login?: string } | undefined;
        const reviewerLogin = author?.login ?? "";
        const body = (cm.body as string) ?? "";
        if (!reviewerLogin || !body.trim()) continue;

        items.push({
          externalReference: `github:pr-comment:${fullName}#${prNumber}:${cm.id}`,
          reviewerLogin,
          body,
          evidenceLabel: `${repoName} — PR #${prNumber} review comment`,
          evidenceUrl: (cm.html_url as string) ?? prUrl,
          rating: 3,
          recommendation: CONTEXT_RECOMMENDATION.SUPPORT,
          kind: "pr-comment",
          prNumber,
          reviewDate: (cm.created_at as string) ?? new Date().toISOString(),
        });
      }
    }
  }

  // 4. Issue comments on the PR thread
  const issueCommentsResp = await fetch(
    `${GH}/repos/${fullName}/issues/${prNumber}/comments?per_page=100`,
    { headers },
  );
  if (issueCommentsResp.ok) {
    const issueComments = await issueCommentsResp.json() as Array<Record<string, unknown>>;
    if (Array.isArray(issueComments)) {
      for (const cm of issueComments) {
        const author = cm.user as { login?: string } | undefined;
        const reviewerLogin = author?.login ?? "";
        const body = (cm.body as string) ?? "";
        if (!reviewerLogin || !body.trim()) continue;
        if (/^approved these changes/i.test(body.trim())) continue;

        items.push({
          externalReference: `github:issue-comment:${fullName}#${prNumber}:${cm.id}`,
          reviewerLogin,
          body,
          evidenceLabel: `${repoName} — PR #${prNumber} issue comment`,
          evidenceUrl: (cm.html_url as string) ?? prUrl,
          rating: 3,
          recommendation: CONTEXT_RECOMMENDATION.SUPPORT,
          kind: "issue-comment",
          prNumber,
          reviewDate: (cm.created_at as string) ?? new Date().toISOString(),
        });
      }
    }
  }

  return items;
}

/**
 * Import GitHub reviews for one synced evidence record / repository.
 */
export async function importGitHubReviewsForEvidence(
  userId: string,
  target: GitHubImportTarget,
  ghConn: GitHubConnection,
): Promise<number> {
  const fullName = target.repo_full_name
    ?? (target.metadata?.full_name as string | undefined);
  const repoId = target.github_repo_id;
  if (!fullName || !repoId) return 0;

  const learnerLogin = ghConn.username.toLowerCase();
  const projectId = `gh-${repoId}`;

  await syncContributorsForRepo(userId, target, ghConn);
  const contributorLogins = await loadContributorLogins(
    userId,
    repoId,
    target.evidence_record_id,
  );
  if (!contributorLogins.size) return 0;

  let skillId: string | null = null;
  let skillName = target.linked_skill_name ?? "General";

  if (target.evidence_record_id) {
    const { data: skillLinks } = await supabaseService.client
      .from("skill_evidence_links")
      .select("skill_id, declared_skills(name)")
      .eq("evidence_record_id", target.evidence_record_id)
      .eq("user_id", userId)
      .limit(1);

    const skillLink = skillLinks?.[0] as {
      skill_id: string;
      declared_skills: { name: string } | { name: string }[] | null;
    } | undefined;
    skillId = skillLink?.skill_id ?? null;
    if (skillLink?.declared_skills) {
      skillName = Array.isArray(skillLink.declared_skills)
        ? skillLink.declared_skills[0]?.name ?? skillName
        : skillLink.declared_skills.name ?? skillName;
    }
  }

  let existingQuery = supabaseService.client
    .from("peer_reviews")
    .select("external_reference")
    .eq("learner_user_id", userId);

  existingQuery = target.evidence_record_id
    ? existingQuery.eq("evidence_record_id", target.evidence_record_id)
    : existingQuery.eq("project_id", projectId);

  const { data: existing } = await existingQuery;

  const existingRefs = new Set(
    (existing ?? [])
      .map((r) => r.external_reference as string)
      .filter(Boolean),
  );

  const baseReview = {
    learner_user_id: userId,
    source: "GitHub",
    origin: "GitHub PR",
    review_source: REVIEW_SOURCE.GITHUB,
    skill: skillName,
    project_id: projectId,
    project_name: target.repository_name,
    review_type: REVIEW_TYPE.IMPORTED,
    evidence_record_id: target.evidence_record_id,
    skill_id: skillId,
    context_status: CONTEXT_STATUS.VERIFIED,
    context_verified: true,
    contributor_verification: CONTRIBUTOR_VERIFICATION.VERIFIED,
    imported: true,
  };

  let imported = 0;

  try {
    const pulls = await fetchPullRequests(fullName, ghConn.token);

    for (const pr of pulls) {
      const prNumber = pr.number as number;
      const prUrl = (pr.html_url as string) ?? target.repository_url;
      const candidates = await collectReviewsForPullRequest(
        fullName,
        prNumber,
        prUrl,
        target.repository_name,
        ghConn.token,
      );

      for (const item of candidates) {
        // 5 & 8. Only verified repo contributors; ignore everyone else.
        if (!isVerifiedContributor(item.reviewerLogin, contributorLogins, learnerLogin)) {
          continue;
        }
        if (existingRefs.has(item.externalReference)) continue;

        const ok = await insertImportedReview({
          ...baseReview,
          reviewer_name: item.reviewerLogin,
          ...reviewTrustFields("Same repo contributor"),
          evidence_label: item.evidenceLabel,
          evidence_url: item.evidenceUrl,
          rating: item.rating,
          comment: item.body,
          recommendation: item.recommendation,
          external_reference: item.externalReference,
          review_date: item.reviewDate,
          reviewed_at: item.reviewDate,
        });

        if (ok) {
          existingRefs.add(item.externalReference);
          imported += 1;
        }
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[SIJIL GitHub import] error:", err);
    }
  }

  return imported;
}

function mapEvidenceRecordRow(row: Record<string, unknown>): GitHubImportTarget {
  return {
    user_id: row.user_id as string,
    evidence_record_id: row.id as string,
    source: (row.source as string) ?? "GitHub",
    repository_name: row.repository_name as string,
    repository_url: row.repository_url as string,
    repo_full_name: (row.repo_full_name as string | null) ?? null,
    github_repo_id: Number(row.github_repo_id ?? 0),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

function mapGitHubRepoRow(row: Record<string, unknown>): GitHubImportTarget {
  return {
    user_id: row.user_id as string,
    evidence_record_id: null,
    source: "GitHub",
    repository_name: row.repo_name as string,
    repository_url: row.github_url as string,
    repo_full_name: row.full_name as string,
    github_repo_id: Number(row.repo_id),
    metadata: null,
    linked_skill_name: (row.linked_skill_name as string | null) ?? null,
  };
}

/** Resolve a synced GitHub project (gh-* / ev-*) or evidence UUID to an import target. */
export async function resolveGitHubImportTarget(
  userId: string,
  opts: { projectId?: string; evidenceId?: string },
): Promise<GitHubImportTarget | null> {
  if (opts.evidenceId) {
    const { data } = await supabaseService.client
      .from("evidence_records")
      .select("id, user_id, source, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
      .eq("id", opts.evidenceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return mapEvidenceRecordRow(data as Record<string, unknown>);
  }

  if (opts.projectId?.startsWith("ev-")) {
    return resolveGitHubImportTarget(userId, { evidenceId: opts.projectId.slice(3) });
  }

  if (opts.projectId?.startsWith("gh-")) {
    const repoId = Number(opts.projectId.slice(3));
    if (!repoId) return null;

    const [{ data: evidence }, { data: repo }] = await Promise.all([
      supabaseService.client
        .from("evidence_records")
        .select("id, user_id, source, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
        .eq("user_id", userId)
        .eq("github_repo_id", repoId)
        .maybeSingle(),
      supabaseService.client
        .from("github_repos")
        .select("user_id, repo_id, repo_name, full_name, github_url, linked_skill_name")
        .eq("user_id", userId)
        .eq("repo_id", repoId)
        .maybeSingle(),
    ]);

    if (evidence) return mapEvidenceRecordRow(evidence as Record<string, unknown>);
    if (repo) return mapGitHubRepoRow(repo as Record<string, unknown>);
  }

  return null;
}

export async function importGitHubReviewsForProject(
  userId: string,
  projectId: string,
  ghConn: GitHubConnection,
): Promise<number> {
  const target = await resolveGitHubImportTarget(userId, { projectId });
  if (!target) return 0;
  return importGitHubReviewsForEvidence(userId, target, ghConn);
}

/** Import GitHub reviews for every synced GitHub evidence record owned by the learner. */
export async function importGitHubReviewsForAllSyncedRepos(
  userId: string,
  ghConn: GitHubConnection,
): Promise<number> {
  const importedRepoIds = new Set<number>();
  let total = 0;

  const { data: records } = await supabaseService.client
    .from("evidence_records")
    .select("id, user_id, source, repository_name, repository_url, repo_full_name, github_repo_id, metadata")
    .eq("user_id", userId)
    .eq("source", "GitHub");

  for (const row of records ?? []) {
    const target = mapEvidenceRecordRow(row as Record<string, unknown>);
    if (target.github_repo_id) importedRepoIds.add(target.github_repo_id);
    total += await importGitHubReviewsForEvidence(userId, target, ghConn);
  }

  const { data: repos } = await supabaseService.client
    .from("github_repos")
    .select("user_id, repo_id, repo_name, full_name, github_url, linked_skill_name")
    .eq("user_id", userId);

  for (const row of repos ?? []) {
    const repoId = Number(row.repo_id);
    if (importedRepoIds.has(repoId)) continue;
    total += await importGitHubReviewsForEvidence(
      userId,
      mapGitHubRepoRow(row as Record<string, unknown>),
      ghConn,
    );
  }

  return total;
}

import { supabase } from "@/integrations/supabase/client";
import type { PeerReview, ReviewInvitation } from "@/lib/sijil-data";
import {
  countWalletEvidence,
  deriveWalletSourceBadges,
  type WalletEvidenceSummary,
} from "@/lib/wallet-competency-shared";

export type SecureReviewInvitation = {
  id: string;
  learner_user_id: string;
  skill_id: string | null;
  competency_name: string | null;
  competency_domain: string | null;
  contributor_email: string | null;
  contributor_id: string | null;
  contributor_name: string | null;
  token: string;
  review_link: string | null;
  status: string;
  expires_at: string;
  used_at: string | null;
  email_status: string | null;
  error_message: string | null;
  created_at: string;
  project_id?: string;
  project_name?: string;
  source?: string;
  contributor_role?: string;
  learner_name?: string;
};

function contributorGithubLogin(contributorId: string | null | undefined): string | null {
  if (!contributorId) return null;
  if (contributorId.startsWith("email-")) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contributorId)) {
    return null;
  }
  return contributorId.replace("@", "").trim() || null;
}

function walletClient() {
  return supabase as unknown as {
    from: (table: string) => any;
  };
}

function rawTable(table: string) {
  return (supabase as unknown as {
    from: (name: string) => any;
  }).from(table);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function toWalletReview(review: PeerReview): Record<string, unknown> {
  return {
    id: review.id,
    reviewerName: review.reviewerName,
    reviewerRole: review.reviewerRole,
    source: review.source,
    origin: review.origin,
    skill: review.skill,
    projectId: review.projectId,
    projectName: review.projectName,
    evidenceLabel: review.evidenceLabel,
    evidenceUrl: review.evidenceUrl,
    rating: review.rating,
    comment: review.comment,
    recommendation: review.recommendation,
    date: review.date,
    contextStatus: review.contextStatus,
    contributorVerification: review.contributorVerification,
    trustWeight: review.trustWeight,
    imported: review.imported,
  };
}

function rebuildWalletSummary(summary: WalletEvidenceSummary): WalletEvidenceSummary {
  const sourceBadges = deriveWalletSourceBadges({
    github: [
      ...summary.github.repos,
      ...summary.github.activities,
      ...summary.github.evidenceRecords,
      ...summary.github.reviews,
    ],
    lms: [
      ...summary.lms.evidence,
      ...summary.lms.courses,
      ...summary.lms.assignments,
      ...summary.lms.grades,
      ...summary.lms.importedEvidence,
    ],
    practicalTasks: summary.practicalTask.attemptHistory,
    reviews: [...summary.peerReviews, ...summary.teacherFeedback],
  });

  return {
    ...summary,
    sourceBadges,
    evidenceCount: countWalletEvidence({
      github: summary.github,
      lms: summary.lms,
      practicalTasks: summary.practicalTask.attemptHistory,
      peerReviews: summary.peerReviews,
      teacherFeedback: summary.teacherFeedback,
    }),
  };
}

async function syncWalletReviewState(params: {
  learnerUserId: string;
  skillId?: string | null;
  competencyName?: string | null;
  review: PeerReview;
}): Promise<void> {
  const client = walletClient();
  let walletRow: Record<string, unknown> | null = null;

  if (params.skillId) {
    const { data, error } = await client
      .from("wallet_competency_records")
      .select("*")
      .eq("learner_id", params.learnerUserId)
      .eq("competency_id", params.skillId)
      .maybeSingle();

    if (!error && data) {
      walletRow = data as Record<string, unknown>;
    }
  }

  if (!walletRow && params.competencyName) {
    const { data, error } = await client
      .from("wallet_competency_records")
      .select("*")
      .eq("learner_id", params.learnerUserId);

    if (!error) {
      walletRow = ((data ?? []) as Record<string, unknown>[]).find((row) => {
        const summary = asObject(row.evidence_summary);
        const competency = asObject(summary?.competency);
        return String(row.competency_name ?? "").trim().toLowerCase() === params.competencyName?.trim().toLowerCase()
          || String(competency?.name ?? "").trim().toLowerCase() === params.competencyName?.trim().toLowerCase();
      }) ?? null;
    }
  }

  if (!walletRow) return;

  const rawSummary = asObject(walletRow.evidence_summary);
  if (!rawSummary) return;

  const github = asObject(rawSummary.github);
  const lms = asObject(rawSummary.lms);
  const practicalTask = asObject(rawSummary.practicalTask);
  const learner = asObject(rawSummary.learner);
  const competency = asObject(rawSummary.competency);
  const institutionReview = asObject(rawSummary.institutionReview);
  const evidenceTimestamps = asObject(rawSummary.evidenceTimestamps);
  const nextReview = toWalletReview(params.review);

  const peerReviews = [
    nextReview,
    ...asList(rawSummary.peerReviews).filter((item) => String(item.id ?? "") !== params.review.id),
  ];

  const nextSummary = rebuildWalletSummary({
    competency: {
      id: String(competency?.id ?? walletRow.competency_id ?? ""),
      name: String(competency?.name ?? walletRow.competency_name ?? ""),
      domain: String(competency?.domain ?? "General"),
      description: String(competency?.description ?? ""),
    },
    learner: {
      id: String(learner?.id ?? walletRow.learner_id ?? ""),
      did: typeof learner?.did === "string" ? learner.did : null,
    },
    github: {
      repos: asList(github?.repos),
      activities: asList(github?.activities),
      evidenceRecords: asList(github?.evidenceRecords),
      reviews: asList(github?.reviews),
    },
    lms: {
      evidence: asList(lms?.evidence),
      courses: asList(lms?.courses),
      assignments: asList(lms?.assignments),
      grades: asList(lms?.grades),
      importedEvidence: asList(lms?.importedEvidence),
    },
    practicalTask: {
      latestAttempt: asObject(practicalTask?.latestAttempt) as WalletEvidenceSummary["practicalTask"]["latestAttempt"],
      attemptHistory: Array.isArray(practicalTask?.attemptHistory)
        ? practicalTask.attemptHistory as WalletEvidenceSummary["practicalTask"]["attemptHistory"]
        : [],
    },
    peerReviews,
    teacherFeedback: asList(rawSummary.teacherFeedback),
    institutionReview: {
      status: typeof institutionReview?.status === "string" ? institutionReview.status : null,
      feedback: typeof institutionReview?.feedback === "string" ? institutionReview.feedback : null,
      reviewedAt: typeof institutionReview?.reviewedAt === "string" ? institutionReview.reviewedAt : null,
    },
    evidenceTimestamps: {
      github: Array.isArray(evidenceTimestamps?.github) ? evidenceTimestamps.github as string[] : [],
      lms: Array.isArray(evidenceTimestamps?.lms) ? evidenceTimestamps.lms as string[] : [],
      practicalTask: Array.isArray(evidenceTimestamps?.practicalTask) ? evidenceTimestamps.practicalTask as string[] : [],
      peerReviews: [
        params.review.date,
        ...(Array.isArray(evidenceTimestamps?.peerReviews) ? evidenceTimestamps.peerReviews as string[] : []),
      ].filter(Boolean),
      teacherFeedback: Array.isArray(evidenceTimestamps?.teacherFeedback) ? evidenceTimestamps.teacherFeedback as string[] : [],
    },
    sourceBadges: [],
    evidenceCount: 0,
  });

  await client
    .from("wallet_competency_records")
    .update({
      status: "Review Available",
      evidence_summary: nextSummary,
    })
    .eq("id", walletRow.id);
}

function mapInvitationStatus(raw: string): ReviewInvitation["status"] {
  const s = raw.toLowerCase();
  if (s === "used" || s === "completed") return "Completed";
  if (s === "expired") return "Expired";
  if (s === "pending" || s === "sent") return "Sent";
  return "Pending";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function pickDisplayName(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isUuid(trimmed) || trimmed.startsWith("email-") || trimmed.startsWith("external-")) {
    return null;
  }
  return trimmed;
}

type ReviewEvidencePackage = {
  reviewer?: {
    name?: string;
    email?: string;
    githubUsername?: string;
    role?: string;
  };
  project?: {
    id?: string;
    name?: string;
    source?: string;
  };
  competency?: {
    name?: string;
    domain?: string;
  };
};

function parseEvidencePackage(row: Record<string, unknown>): ReviewEvidencePackage | null {
  const raw = row.evidence_package;
  if (!raw) return null;
  if (typeof raw === "object") return raw as ReviewEvidencePackage;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ReviewEvidencePackage;
    } catch {
      return null;
    }
  }
  return null;
}

function parseRating(row: Record<string, unknown>): PeerReview["rating"] {
  const confidence = row.reviewer_confidence;
  const ratingRaw = row.rating;
  const n = Number(
    typeof confidence === "string" ? confidence : confidence ?? ratingRaw ?? 3,
  );
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n as PeerReview["rating"];
  return 3;
}

export function rowToReview(row: Record<string, unknown>): PeerReview {
  const reviewType = row.review_type as string | undefined;
  const imported =
    typeof row.imported === "boolean"
      ? row.imported
      : reviewType === "Imported Context Review";

  const evidencePackage = parseEvidencePackage(row);
  const competencyName = row.competency_name as string | undefined;
  const reviewText = row.review_text as string | undefined;
  const decision = row.decision as string | undefined;
  const reviewedAt = row.reviewed_at as string | undefined;
  const reviewerGithub = row.reviewer_github_username as string | undefined;
  const reviewerEmail = row.reviewer_email as string | undefined;
  const rowOrigin = row.origin as string | undefined;

  const reviewerName =
    pickDisplayName(row.reviewer_name as string | undefined)
    ?? pickDisplayName(evidencePackage?.reviewer?.name)
    ?? pickDisplayName(reviewerEmail)
    ?? pickDisplayName(reviewerGithub)
    ?? pickDisplayName(evidencePackage?.reviewer?.githubUsername)
    ?? "Verified contributor";

  const projectName =
    (row.project_name as string | undefined)
    ?? evidencePackage?.project?.name
    ?? undefined;

  const skill =
    (row.skill as string | undefined)
    ?? competencyName
    ?? evidencePackage?.competency?.name
    ?? "Declared competency";

  const origin: PeerReview["origin"] =
    rowOrigin === "SIJIL Form Review"
      ? "SIJIL Form Review"
      : (rowOrigin as PeerReview["origin"]) ?? (imported ? "GitHub PR" : "SIJIL Form Review");

  return {
    id: row.id as string,
    reviewerName,
    reviewerRole: ((row.reviewer_role as PeerReview["reviewerRole"])
      ?? evidencePackage?.reviewer?.role
      ?? "Project Collaborator") as PeerReview["reviewerRole"],
    source: normalizeInvitationSource(
      (row.source as string | undefined)
      ?? evidencePackage?.project?.source
      ?? "github",
    ),
    origin,
    skill,
    projectId: (row.project_id as string | undefined)
      ?? evidencePackage?.project?.id
      ?? (row.evidence_record_id ? `ev-${row.evidence_record_id}` : undefined),
    projectName,
    evidenceLabel: ((row.evidence_label as string | undefined)
      ?? projectName
      ?? evidencePackage?.reviewer?.name
      ?? "Peer review evidence"),
    evidenceUrl: (row.evidence_url as string | undefined) ?? undefined,
    rating: parseRating(row),
    comment: reviewText ?? (row.comment as string) ?? "",
    recommendation: (decision ?? row.recommendation) as PeerReview["recommendation"],
    date: reviewedAt ?? (row.review_date as string) ?? new Date().toISOString(),
    contextStatus: (row.context_status as PeerReview["contextStatus"])
      ?? ((row.verification_status as string) === "verified"
        ? "Context Verified"
        : imported ? "Context Pending" : "Context Not Verified"),
    contributorVerification:
      (row.verification_status as string) === "verified" || row.contributor_verification
        ? "Contributor Verified"
        : undefined,
    trustWeight: (row.trust_weight as PeerReview["trustWeight"])
      ?? (Number(row.trust_weight_score) >= 0.85 ? "High Trust" : "Medium Trust"),
    imported,
  };
}

/** Columns allowed for secure invite peer review inserts. */
const SECURE_PEER_REVIEW_INSERT_KEYS = [
  "user_id",
  "learner_user_id",
  "reviewer_name",
  "reviewer_role",
  "source",
  "origin",
  "skill",
  "skill_id",
  "competency_name",
  "competency_domain",
  "project_id",
  "project_name",
  "evidence_label",
  "evidence_url",
  "rating",
  "status",
  "review_text",
  "decision",
  "reviewer_confidence",
  "evidence_package",
  "reviewed_at",
  "reviewer_email",
  "reviewer_github_username",
  "contributor_verification",
  "verification_status",
  "invitation_id",
] as const;

function pickSecurePeerReviewInsertPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of SECURE_PEER_REVIEW_INSERT_KEYS) {
    if (payload[key] !== undefined) {
      safe[key] = payload[key];
    }
  }
  return safe;
}

export async function fetchPeerReviews(userId: string): Promise<PeerReview[]> {
  const { data, error } = await supabase
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToReview);
}

export async function fetchPeerReviewsForUsers(userIds: string[]): Promise<Record<string, PeerReview[]>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from("peer_reviews")
    .select("*")
    .in("learner_user_id", userIds);
  if (error) throw error;
  const map: Record<string, PeerReview[]> = {};
  for (const row of data ?? []) {
    const uid = row.learner_user_id as string;
    if (!map[uid]) map[uid] = [];
    map[uid].push(rowToReview(row));
  }
  return map;
}

export async function addPeerReviewDb(userId: string, review: Omit<PeerReview, "id">): Promise<PeerReview> {
  const { data, error } = await rawTable("peer_reviews")
    .insert({
      user_id: userId,
      learner_user_id: userId,
      reviewer_name: review.reviewerName,
      reviewer_role: review.reviewerRole,
      source: review.source,
      origin: review.origin,
      skill: review.skill,
      project_id: review.projectId,
      project_name: review.projectName,
      evidence_label: review.evidenceLabel,
      evidence_url: review.evidenceUrl,
      rating: review.rating,
      comment: review.comment,
      recommendation: review.recommendation,
      review_date: review.date,
      context_status: review.contextStatus,
      contributor_verification: review.contributorVerification,
      trust_weight: review.trustWeight,
      imported: review.imported,
    })
    .select("*")
    .single();
  if (error) throw error;
  const inserted = rowToReview(data);
  await syncWalletReviewState({
    learnerUserId: userId,
    competencyName: inserted.skill,
    review: inserted,
  });
  return inserted;
}

function rowToInvitation(row: Record<string, unknown>): ReviewInvitation {
  const competencyName = row.competency_name as string | null | undefined;
  const contributorEmail = row.contributor_email as string | null | undefined;

  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    source: normalizeInvitationSource(row.source as string),
    contributorId: row.contributor_id as string,
    contributorName: row.contributor_name as string,
    contributorEmail: contributorEmail ?? undefined,
    contributorRole: row.contributor_role as ReviewInvitation["contributorRole"],
    learnerName: (row.learner_name as string | undefined) ?? "",
    skill: competencyName ?? (row.skill as string),
    status: mapInvitationStatus(row.status as string),
    sentAt: (row.sent_at as string | undefined) ?? (row.created_at as string),
    completedReviewId: row.completed_review_id as string | undefined,
    reviewLink: row.review_link as string | undefined,
    token: row.token as string | undefined,
    expiresAt: row.expires_at as string | undefined,
  };
}

function normalizeInvitationSource(raw: string): ReviewInvitation["source"] {
  const s = raw?.toLowerCase() ?? "";
  if (s === "github") return "GitHub";
  if (s === "lms") return "LMS";
  if (s === "spark") return "Spark";
  if (s === "manual team" || s === "manual project") return "Manual Project";
  return (raw as ReviewInvitation["source"]) || "GitHub";
}

function normalizeInvitationSourceForDb(source: string): string {
  return source.toLowerCase() === "github" ? "github" : source;
}

export function rowToSecureInvitation(row: Record<string, unknown>): SecureReviewInvitation {
  const contributorId = (row.contributor_id as string | null) ?? null;
  return {
    id: row.id as string,
    learner_user_id: row.learner_user_id as string,
    skill_id: (row.skill_id as string | null) ?? null,
    competency_name: (row.competency_name as string | null) ?? null,
    competency_domain: (row.competency_domain as string | null) ?? null,
    contributor_email: (row.contributor_email as string | null) ?? null,
    contributor_id: contributorId,
    contributor_name: (row.contributor_name as string | null) ?? null,
    token: row.token as string,
    review_link: (row.review_link as string | null) ?? null,
    status: row.status as string,
    expires_at: row.expires_at as string,
    used_at: (row.used_at as string | null) ?? null,
    email_status: (row.email_status as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: row.created_at as string,
    project_id: row.project_id as string | undefined,
    project_name: row.project_name as string | undefined,
    source: row.source as string | undefined,
    contributor_role: row.contributor_role as string | undefined,
    learner_name: row.learner_name as string | undefined,
  };
}

/** GitHub login stored on invitation for identity check (contributor_id when not a UUID). */
export function invitationGithubUsername(invitation: SecureReviewInvitation): string | null {
  return contributorGithubLogin(invitation.contributor_id);
}

export async function findInvitationByToken(token: string): Promise<SecureReviewInvitation | null> {
  const { data, error } = await supabase
    .from("review_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSecureInvitation(data as Record<string, unknown>) : null;
}

export async function markInvitationUsed(id: string): Promise<void> {
  const { error } = await supabase
    .from("review_invitations")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export type ReviewInvitationInsertPayload = {
  learner_user_id: string;
  project_id: string;
  project_name: string;
  source: string;
  contributor_id: string;
  contributor_name: string;
  contributor_email: string | null;
  contributor_role: string;
  skill_id: string | null;
  competency_name: string;
  competency_domain: string;
  token: string;
  review_link: string;
  status: string;
  expires_at: string;
  email_status: string;
  learner_name: string;
  skill: string;
};

export async function createSecureReviewInvitation(
  payload: ReviewInvitationInsertPayload,
): Promise<SecureReviewInvitation> {
  const { data, error } = await rawTable("review_invitations")
    .insert({
      ...payload,
      source: normalizeInvitationSourceForDb(payload.source),
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToSecureInvitation(data as Record<string, unknown>);
}

export async function submitSecurePeerReview(
  invitation: SecureReviewInvitation,
  review: {
    reviewText: string;
    decision: string;
    confidence: number;
    reviewerEmail?: string;
    reviewerGithubUsername?: string;
  },
): Promise<PeerReview> {
  if (!invitation.learner_user_id) {
    throw new Error("Invitation is missing learner user id.");
  }

  const learnerUserId = invitation.learner_user_id;
  const reviewerEmail = review.reviewerEmail ?? invitation.contributor_email ?? null;
  const reviewerGithubUsername = review.reviewerGithubUsername ?? null;

  const peerReviewPayload = {
    user_id: learnerUserId,
    learner_user_id: learnerUserId,

    reviewer_name:
      invitation.contributor_name
      || invitation.contributor_email
      || pickDisplayName(invitation.contributor_id)
      || reviewerEmail
      || pickDisplayName(reviewerGithubUsername)
      || "Verified contributor",

    reviewer_role:
      invitation.contributor_role
      || "Project Collaborator",

    source:
      invitation.source
      || "github",

    origin:
      "SIJIL Form Review",

    skill:
      invitation.competency_name
      || "Declared competency",

    skill_id:
      invitation.skill_id
      || null,

    competency_name:
      invitation.competency_name
      || "Declared competency",

    competency_domain:
      invitation.competency_domain
      || "Not specified",

    project_id:
      invitation.project_id
      || null,

    project_name:
      invitation.project_name
      || "GitHub project",

    evidence_label:
      invitation.project_name
      || invitation.contributor_name
      || "Peer review evidence",

    evidence_url:
      invitation.review_link
      || null,

    rating:
      Number(review.confidence) || null,

    status: "reviewed",

    review_text: review.reviewText,
    decision: review.decision,
    reviewer_confidence: String(review.confidence),

    reviewer_email:
      reviewerEmail
      || invitation.contributor_email
      || null,

    reviewer_github_username:
      reviewerGithubUsername
      || pickDisplayName(invitation.contributor_id)
      || null,

    contributor_verification: {
      method: invitation.contributor_email ? "email" : "github_username",
      invitedEmail: invitation.contributor_email || null,
      enteredEmail: reviewerEmail || null,
      invitedGithub: invitation.contributor_id || invitation.contributor_name || null,
      enteredGithub: reviewerGithubUsername || null,
      verifiedAt: new Date().toISOString(),
    },

    verification_status: "verified",
    invitation_id: invitation.id,

    evidence_package: {
      invitation,
      reviewer: {
        name:
          invitation.contributor_name
          || invitation.contributor_email
          || pickDisplayName(invitation.contributor_id)
          || "Verified contributor",
        email: reviewerEmail || invitation.contributor_email || null,
        githubUsername: reviewerGithubUsername || pickDisplayName(invitation.contributor_id) || null,
        role: invitation.contributor_role || "Project Collaborator",
      },
      project: {
        id: invitation.project_id || null,
        name: invitation.project_name || "GitHub project",
        source: invitation.source || "github",
      },
      competency: {
        name: invitation.competency_name || "Declared competency",
        domain: invitation.competency_domain || "Not specified",
      },
    },

    reviewed_at: new Date().toISOString(),
  };

  if (!peerReviewPayload.user_id && !peerReviewPayload.learner_user_id) {
    throw new Error("Invitation is missing learner user id.");
  }

  console.log("Invitation used for review:", invitation);
  console.log("Peer review payload:", peerReviewPayload);

  const { data: insertedReview, error: reviewError } = await rawTable("peer_reviews")
    .insert(pickSecurePeerReviewInsertPayload(peerReviewPayload))
    .select("*")
    .single();

  console.log("Review insert error:", reviewError);
  console.log("Inserted review:", insertedReview);

  if (reviewError) {
    throw new Error(reviewError.message || "Could not submit review");
  }

  const inserted = rowToReview(insertedReview as Record<string, unknown>);
  await syncWalletReviewState({
    learnerUserId,
    skillId: invitation.skill_id,
    competencyName: invitation.competency_name,
    review: inserted,
  });
  return inserted;
}

export async function fetchInvitations(userId: string): Promise<ReviewInvitation[]> {
  const { data, error } = await supabase
    .from("review_invitations")
    .select("*")
    .eq("learner_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToInvitation);
}

export async function addInvitationDb(userId: string, inv: Omit<ReviewInvitation, "id">): Promise<ReviewInvitation> {
  const { data, error } = await supabase
    .from("review_invitations")
    .insert({
      learner_user_id: userId,
      project_id: inv.projectId,
      project_name: inv.projectName,
      source: inv.source,
      contributor_id: inv.contributorId,
      contributor_name: inv.contributorName,
      contributor_email: inv.contributorEmail,
      contributor_role: inv.contributorRole,
      learner_name: inv.learnerName,
      skill: inv.skill,
      status: inv.status,
      sent_at: inv.sentAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToInvitation(data);
}

export async function findInvitationDb(id: string): Promise<ReviewInvitation | undefined> {
  const { data, error } = await supabase
    .from("review_invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToInvitation(data) : undefined;
}

export async function updateInvitationDb(id: string, patch: Partial<ReviewInvitation>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.sentAt !== undefined) dbPatch.sent_at = patch.sentAt;
  if (patch.completedReviewId !== undefined) dbPatch.completed_review_id = patch.completedReviewId;
  const { error } = await rawTable("review_invitations").update(dbPatch).eq("id", id);
  if (error) throw error;
}

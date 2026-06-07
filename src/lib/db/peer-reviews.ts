import { supabase } from "@/integrations/supabase/client";
import type { PeerReview, ReviewInvitation } from "@/lib/sijil-data";

function rowToReview(row: Record<string, unknown>): PeerReview {
  return {
    id: row.id as string,
    reviewerName: row.reviewer_name as string,
    reviewerRole: row.reviewer_role as PeerReview["reviewerRole"],
    source: row.source as PeerReview["source"],
    origin: row.origin as PeerReview["origin"],
    skill: row.skill as string,
    projectId: row.project_id as string | undefined,
    projectName: row.project_name as string | undefined,
    evidenceLabel: row.evidence_label as string,
    evidenceUrl: row.evidence_url as string | undefined,
    rating: row.rating as PeerReview["rating"],
    comment: row.comment as string,
    recommendation: row.recommendation as PeerReview["recommendation"],
    date: row.review_date as string,
    contextStatus: row.context_status as PeerReview["contextStatus"],
    contributorVerification: row.contributor_verification as PeerReview["contributorVerification"],
    trustWeight: row.trust_weight as PeerReview["trustWeight"],
    imported: row.imported as boolean,
  };
}

export async function fetchPeerReviews(userId: string): Promise<PeerReview[]> {
  const { data, error } = await supabase
    .from("peer_reviews")
    .select("*")
    .eq("learner_user_id", userId)
    .order("review_date", { ascending: false });
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("peer_reviews")
    .insert({
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
  return rowToReview(data);
}

function rowToInvitation(row: Record<string, unknown>): ReviewInvitation {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    source: row.source as ReviewInvitation["source"],
    contributorId: row.contributor_id as string,
    contributorName: row.contributor_name as string,
    contributorEmail: row.contributor_email as string | undefined,
    contributorRole: row.contributor_role as ReviewInvitation["contributorRole"],
    learnerName: row.learner_name as string,
    skill: row.skill as string,
    status: row.status as ReviewInvitation["status"],
    sentAt: row.sent_at as string,
    completedReviewId: row.completed_review_id as string | undefined,
  };
}

export async function fetchInvitations(userId: string): Promise<ReviewInvitation[]> {
  const { data, error } = await supabase
    .from("review_invitations")
    .select("*")
    .eq("learner_user_id", userId)
    .order("sent_at", { ascending: false });
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
  const { error } = await supabase.from("review_invitations").update(dbPatch).eq("id", id);
  if (error) throw error;
}

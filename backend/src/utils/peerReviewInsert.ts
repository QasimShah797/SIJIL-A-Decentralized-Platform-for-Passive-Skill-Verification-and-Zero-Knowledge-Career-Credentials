/**
 * Legacy peer_reviews tables may require user_id alongside learner_user_id.
 */
export function withPeerReviewUserColumns<T extends Record<string, unknown>>(
  row: T,
): T & { user_id?: string } {
  const learnerId = row.learner_user_id as string | undefined;
  if (learnerId && row.user_id == null) {
    return { ...row, user_id: learnerId };
  }
  return row;
}

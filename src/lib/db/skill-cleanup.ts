/**
 * Remove peer-review and evidence links when a declared competency is deleted.
 */
import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError } from "@/lib/supabase-errors";

export async function cleanupSkillDependents(
  userId: string,
  skillId: string,
  skillName: string,
): Promise<void> {
  const trimmedName = skillName.trim();

  const deleteReviews = async () => {
    await supabase
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId);

    await supabase
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("skill", trimmedName);

    const competencyDelete = await supabase
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("competency_name", trimmedName);

    if (competencyDelete.error && !isMissingColumnError(competencyDelete.error)) {
      throw competencyDelete.error;
    }
  };

  await deleteReviews();

  await supabase
    .from("review_requests")
    .delete()
    .eq("learner_user_id", userId)
    .eq("skill_id", skillId);

  await supabase
    .from("peer_review_invites")
    .delete()
    .eq("learner_user_id", userId)
    .eq("skill_id", skillId);

  await supabase
    .from("peer_review_invites")
    .delete()
    .eq("learner_user_id", userId)
    .eq("skill", trimmedName);

  await supabase
    .from("review_invitations")
    .delete()
    .eq("learner_user_id", userId)
    .eq("skill", trimmedName);

  await supabase
    .from("credentials")
    .delete()
    .eq("user_id", userId)
    .eq("skill_name", trimmedName);

  await supabase
    .from("github_repos")
    .update({
      linked_skill_id: null,
      linked_skill_name: null,
      linked_at: null,
    })
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);

  await supabase
    .from("github_activities")
    .update({ linked_skill_id: null, linked_skill_name: null })
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);

  await supabase
    .from("lms_evidence")
    .update({ linked_skill_id: null })
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);

  await supabase
    .from("evidence_records")
    .update({
      mapped_skill_id: null,
      suggested_skill_id: null,
      suggested_skill_name: null,
    })
    .eq("user_id", userId)
    .or(`mapped_skill_id.eq.${skillId},suggested_skill_id.eq.${skillId}`);

  await supabase
    .from("github_repo_skill_links")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  await supabase
    .from("skill_evidence_links")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId);
}

/** Remove stale review rows when the learner has no declared competencies left. */
export async function cleanupOrphanedLearnerReviewData(userId: string): Promise<void> {
  const { data: skills, error } = await supabase
    .from("declared_skills")
    .select("id")
    .eq("user_id", userId);

  if (error) throw error;
  if ((skills ?? []).length > 0) return;

  await supabase.from("peer_reviews").delete().eq("learner_user_id", userId);
  await supabase.from("review_requests").delete().eq("learner_user_id", userId);
  await supabase.from("peer_review_invites").delete().eq("learner_user_id", userId);
  await supabase.from("review_invitations").delete().eq("learner_user_id", userId);
}

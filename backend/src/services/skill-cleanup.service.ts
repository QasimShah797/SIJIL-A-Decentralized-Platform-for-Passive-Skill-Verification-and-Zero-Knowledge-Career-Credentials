/**
 * Remove peer-review and evidence links when a declared competency is deleted.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";

export async function cleanupSkillDependents(
  userId: string,
  skillId: string,
  skillName: string,
): Promise<void> {
  const client = supabaseService.client;
  const trimmedName = skillName.trim();

  const deleteBySkillId = async (table: string) => {
    const { error } = await client
      .from(table)
      .delete()
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId);
    if (error) throw new AppError(error.message, 500);
  };

  const deleteReviews = async () => {
    const { error: byIdError } = await client
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("skill_id", skillId);
    if (byIdError) throw new AppError(byIdError.message, 500);

    const { error: byNameError } = await client
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("skill", trimmedName);
    if (byNameError) throw new AppError(byNameError.message, 500);

    const { error: byCompetencyError } = await client
      .from("peer_reviews")
      .delete()
      .eq("learner_user_id", userId)
      .eq("competency_name", trimmedName);
    if (byCompetencyError && !byCompetencyError.message.includes("competency_name")) {
      throw new AppError(byCompetencyError.message, 500);
    }
  };

  await deleteReviews();
  await deleteBySkillId("review_requests");
  await deleteBySkillId("peer_review_invites");

  const { error: legacyInviteError } = await client
    .from("review_invitations")
    .delete()
    .eq("learner_user_id", userId)
    .eq("skill", trimmedName);
  if (legacyInviteError) throw new AppError(legacyInviteError.message, 500);

  const { error: credentialError } = await client
    .from("credentials")
    .delete()
    .eq("user_id", userId)
    .eq("skill_name", trimmedName);
  if (credentialError) throw new AppError(credentialError.message, 500);

  const unlinkPatch = {
    linked_skill_id: null,
    linked_skill_name: null,
    linked_at: null,
  };

  const { error: repoError } = await client
    .from("github_repos")
    .update(unlinkPatch)
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);
  if (repoError) throw new AppError(repoError.message, 500);

  const { error: activityError } = await client
    .from("github_activities")
    .update({ linked_skill_id: null, linked_skill_name: null })
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);
  if (activityError) throw new AppError(activityError.message, 500);

  const { error: lmsError } = await client
    .from("lms_evidence")
    .update({ linked_skill_id: null })
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId);
  if (lmsError) throw new AppError(lmsError.message, 500);

  const { error: mappedError } = await client
    .from("evidence_records")
    .update({
      mapped_skill_id: null,
      suggested_skill_id: null,
      suggested_skill_name: null,
    })
    .eq("user_id", userId)
    .or(`mapped_skill_id.eq.${skillId},suggested_skill_id.eq.${skillId}`);
  if (mappedError) throw new AppError(mappedError.message, 500);

  const { error: repoSkillLinkError } = await client
    .from("github_repo_skill_links")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId);
  if (repoSkillLinkError) throw new AppError(repoSkillLinkError.message, 500);

  const { error: evidenceLinkError } = await client
    .from("skill_evidence_links")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId);
  if (evidenceLinkError) throw new AppError(evidenceLinkError.message, 500);
}

/**
 * Removes integration links, reviews, attestation requests, and other data
 * tied to a competency before the declared_skills row is deleted.
 */
import { supabaseService } from "./supabase.service";

function rawTable(table: string) {
  return supabaseService.client.from(table);
}

async function deleteStorageFilesForSkill(userId: string, skillId: string): Promise<void> {
  const { data: records } = await supabaseService.client
    .from("supporting_records")
    .select("url")
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  const paths = (records ?? [])
    .map((row) => {
      const url = row.url as string | null;
      if (!url) return null;
      const marker = "/skill-evidence/";
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      return url.slice(idx + marker.length);
    })
    .filter((path): path is string => !!path);

  if (paths.length > 0) {
    await supabaseService.client.storage.from("skill-evidence").remove(paths);
  }
}

export async function cleanupCompetencyRelatedData(
  userId: string,
  skillId: string,
  skillName: string,
): Promise<void> {
  const normalizedName = skillName.trim();

  await deleteStorageFilesForSkill(userId, skillId);

  const cleanupTasks: Promise<unknown>[] = [
    supabaseService.client.from("peer_reviews").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("peer_reviews").delete().eq("learner_user_id", userId).eq("skill", normalizedName),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("skill", normalizedName),
    rawTable("review_invitations").delete().eq("learner_user_id", userId).eq("competency_name", normalizedName),
    rawTable("review_requests").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    rawTable("peer_review_invites").delete().eq("skill_id", skillId),
    supabaseService.client.from("institution_attestation_requests").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("attestations").delete().eq("learner_user_id", userId).eq("skill_id", skillId),
    supabaseService.client.from("credentials").delete().eq("user_id", userId).eq("skill_name", normalizedName),
    supabaseService.client.from("lms_evidence").delete().eq("user_id", userId).eq("linked_skill_id", skillId),
    supabaseService.client
      .from("github_repos")
      .update({ linked_skill_id: null, linked_skill_name: null, linked_at: null })
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId),
    supabaseService.client
      .from("github_activities")
      .update({ linked_skill_id: null })
      .eq("user_id", userId)
      .eq("linked_skill_id", skillId),
    supabaseService.client
      .from("evidence_records")
      .update({ mapped_skill_id: null })
      .eq("user_id", userId)
      .eq("mapped_skill_id", skillId),
    supabaseService.client
      .from("evidence_records")
      .update({ suggested_skill_id: null, suggested_skill_name: null })
      .eq("user_id", userId)
      .eq("suggested_skill_id", skillId),
  ];

  await Promise.allSettled(cleanupTasks);
}

import { supabase } from "@/integrations/supabase/client";
import type { DeclaredSkill } from "@/lib/sijil-data";

function rowToSkill(row: {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  status: string;
  last_related_activity_at: string | null;
  last_credential_sync_at: string | null;
}): DeclaredSkill {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    description: row.description ?? "",
    status: row.status,
    lastRelatedActivityAt: row.last_related_activity_at,
    lastCredentialSyncAt: row.last_credential_sync_at,
  };
}

export async function fetchDeclaredSkills(userId: string): Promise<DeclaredSkill[]> {
  const { data, error } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSkill);
}

export async function fetchDeclaredSkillsForUsers(userIds: string[]): Promise<Record<string, DeclaredSkill[]>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from("declared_skills")
    .select("*")
    .in("user_id", userIds);
  if (error) throw error;
  const map: Record<string, DeclaredSkill[]> = {};
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (!map[uid]) map[uid] = [];
    map[uid].push(rowToSkill(row));
  }
  return map;
}

export async function insertDeclaredSkill(
  userId: string,
  skill: Pick<DeclaredSkill, "name" | "domain" | "description">,
): Promise<DeclaredSkill> {
  const { data, error } = await supabase
    .from("declared_skills")
    .insert({
      user_id: userId,
      name: skill.name,
      domain: skill.domain || "General",
      description: skill.description || "",
      status: "Skill Claimed",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToSkill(data);
}

export async function deleteDeclaredSkill(userId: string, skillId: string): Promise<void> {
  const { error } = await supabase
    .from("declared_skills")
    .delete()
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
}

export async function updateSkillActivityTimestamp(userId: string, skillId: string): Promise<void> {
  const { error } = await supabase
    .from("declared_skills")
    .update({ last_related_activity_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", skillId);
  if (error) throw error;
}

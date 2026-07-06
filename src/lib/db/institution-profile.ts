import { supabase } from "@/integrations/supabase/client";

export type InstitutionProfileView = {
  userId: string;
  institutionName: string;
  officialEmail: string;
  department: string;
  status: string;
};

export async function fetchInstitutionProfile(userId: string): Promise<InstitutionProfileView | null> {
  const { data, error } = await supabase
    .from("institution_profiles")
    .select("user_id, institution_name, official_email, department, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    userId: data.user_id,
    institutionName: data.institution_name,
    officialEmail: data.official_email,
    department: data.department ?? "",
    status: data.status ?? "",
  };
}

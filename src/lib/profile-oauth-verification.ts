import { supabase } from "@/integrations/supabase/client";
import { isLinkedInOAuthConfigured, probeLinkedInOAuthConfigured } from "@/lib/db/linkedin-connections";

export type OAuthVerificationStatus = {
  githubVerified: boolean;
  linkedinVerified: boolean;
  linkedinRequired: boolean;
  linkedinConfigured: boolean;
};

export async function fetchGitHubVerification(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("github_connections_public")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function fetchLinkedInVerification(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("linkedin_connections")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getOAuthVerificationStatus(userId: string): Promise<OAuthVerificationStatus> {
  await probeLinkedInOAuthConfigured();
  const linkedinConfigured = isLinkedInOAuthConfigured();
  const [githubVerified, linkedinVerified] = await Promise.all([
    fetchGitHubVerification(userId),
    linkedinConfigured ? fetchLinkedInVerification(userId) : Promise.resolve(true),
  ]);

  return {
    githubVerified,
    linkedinVerified: linkedinConfigured ? linkedinVerified : true,
    linkedinRequired: linkedinConfigured,
    linkedinConfigured,
  };
}

export async function meetsOAuthCompletionRequirements(userId: string): Promise<{
  ok: boolean;
  github: boolean;
  linkedin: boolean;
  linkedinRequired: boolean;
}> {
  const status = await getOAuthVerificationStatus(userId);
  const ok = status.githubVerified && status.linkedinVerified;
  return {
    ok,
    github: status.githubVerified,
    linkedin: status.linkedinVerified,
    linkedinRequired: status.linkedinRequired,
  };
}

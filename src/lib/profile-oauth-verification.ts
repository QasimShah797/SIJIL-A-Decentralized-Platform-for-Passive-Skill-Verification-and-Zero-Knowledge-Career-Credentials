import { supabase } from "@/integrations/supabase/client";

export type OAuthVerificationStatus = {
  githubVerified: boolean;
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

export async function getOAuthVerificationStatus(userId: string): Promise<OAuthVerificationStatus> {
  const githubVerified = await fetchGitHubVerification(userId);
  return { githubVerified };
}

export async function meetsOAuthCompletionRequirements(userId: string): Promise<{
  ok: boolean;
  github: boolean;
}> {
  const github = await fetchGitHubVerification(userId);
  return { ok: github, github };
}

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchGitHubConnection, type GitHubConnection } from "@/lib/github-integration";
import { supabase } from "@/integrations/supabase/client";

export type GitHubRepoSummary = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  language: string | null;
  updated_at: string | null;
};

/** Live GitHub data via Supabase-stored OAuth connection + GitHub REST API (edge sync). */
export function useGitHub() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConnection(null);
      setRepos([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const conn = await fetchGitHubConnection(user.id);
      setConnection(conn);

      if (conn) {
        const { data, error: repoErr } = await supabase
          .from("github_repos")
          .select("repo_id, repo_name, full_name, github_url, primary_language, last_updated")
          .eq("user_id", user.id)
          .order("last_updated", { ascending: false, nullsFirst: false })
          .limit(50);
        if (repoErr) throw repoErr;
        setRepos(
          (data ?? []).map((r) => ({
            id: r.repo_id as number,
            name: r.repo_name as string,
            full_name: r.full_name as string,
            html_url: r.github_url as string,
            language: r.primary_language as string | null,
            updated_at: r.last_updated as string | null,
          })),
        );
      } else {
        setRepos([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    connected: !!connection,
    user: connection ? { login: connection.github_username, avatar_url: connection.github_avatar_url } : null,
    connection,
    repos,
    loading,
    error,
    refresh,
  };
}

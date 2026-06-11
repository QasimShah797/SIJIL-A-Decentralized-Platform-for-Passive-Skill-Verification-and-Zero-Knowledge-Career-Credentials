import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  ensureGitHubContextForUser,
  fetchGitHubConnection,
  type GitHubConnection,
} from "@/lib/github-integration";
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
  const fetchGen = useRef(0);

  const clearLocalState = useCallback(() => {
    fetchGen.current += 1;
    setConnection(null);
    setRepos([]);
    setError(null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      clearLocalState();
      return;
    }

    ensureGitHubContextForUser(user.id);
    const gen = ++fetchGen.current;
    const userId = user.id;

    setLoading(true);
    setError(null);
    try {
      const conn = await fetchGitHubConnection(userId);
      if (gen !== fetchGen.current) return;

      setConnection(conn);

      if (conn) {
        const { data, error: repoErr } = await supabase
          .from("github_repos")
          .select("repo_id, repo_name, full_name, github_url, primary_language, last_updated")
          .eq("user_id", userId)
          .order("last_updated", { ascending: false, nullsFirst: false })
          .limit(50);
        if (repoErr) throw repoErr;
        if (gen !== fetchGen.current) return;
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
      if (gen !== fetchGen.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [user, clearLocalState]);

  useEffect(() => {
    if (!user) {
      clearLocalState();
      return;
    }
    refresh();
  }, [user?.id, refresh, clearLocalState]);

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

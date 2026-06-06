import { useState, useEffect } from "react";
import { fetchGitHubUser, fetchGitHubRepos } from "@/lib/github-api";

export function useGitHub() {
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("github_token");
    if (!token) return;

    setLoading(true);
    Promise.all([fetchGitHubUser(token), fetchGitHubRepos(token)])
      .then(([userData, reposData]) => {
        setUser(userData);
        setRepos(reposData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { user, repos, loading, error };
}

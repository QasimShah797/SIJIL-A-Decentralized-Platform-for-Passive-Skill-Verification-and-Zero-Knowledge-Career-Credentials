/**
 * GitHub portfolio sync — fetches repos/commits/PRs server-side and stores evidence records.
 * Does not auto-link repositories to skills; preserves existing manual links on re-sync.
 */
import { supabaseService } from "./supabase.service";
import { isMissingColumnError } from "../utils/supabase-errors";
import { AppError } from "../utils/AppError";
import {
  EVIDENCE_RECORD_STATUS,
  EVIDENCE_SOURCE,
  EVIDENCE_TYPE,
  GITHUB_SYNC_STATUS,
} from "../constants/evidence";
import type { GitHubSyncResult } from "../types/github-evidence.types";
import { bytesToPercentages } from "../utils/evidence-matching";

const GH = "https://api.github.com";

export async function fetchLearnerCommitMetrics(
  fullName: string,
  login: string,
  headers: Record<string, string>,
  request: typeof fetch = fetch,
): Promise<{ learner_commit_count: number | null; learner_last_commit_at: string | null }> {
  const missing = { learner_commit_count: null, learner_last_commit_at: null };
  const names = fullName.split("/");
  if (names.length !== 2 || names.some((name) => !/^[a-z0-9_.-]+$/i.test(name) || name === "." || name === "..")) return missing;
  const query = new URLSearchParams({ author: login, per_page: "1" });
  try {
    const response = await request(`${GH}/repos/${names.map(encodeURIComponent).join("/")}/commits?${query}`, {
      headers, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return missing;
    const commits = await response.json();
    if (!Array.isArray(commits)) return missing;
    const links = response.headers.get("link") ?? "";
    const last = links.match(/<([^>]+)>;\s*rel="last"/)?.[1];
    const total = last ? Number(new URL(last).searchParams.get("page"))
      : links.includes('rel="next"') ? null : commits.length;
    const date = commits[0]?.commit?.author?.date;
    return {
      learner_commit_count: total !== null && Number.isSafeInteger(total) && total >= commits.length ? total : null,
      learner_last_commit_at: typeof date === "string" && Number.isFinite(Date.parse(date)) ? date : null,
    };
  } catch {
    return missing;
  }
}

type DeclaredSkillRef = { id: string; name: string; domain?: string };

type GitHubConnection = {
  user_id: string;
  github_username: string;
  access_token: string;
};

async function fetchRepoLanguages(
  fullName: string,
  ghHeaders: Record<string, string>,
): Promise<Record<string, number>> {
  try {
    const resp = await fetch(`${GH}/repos/${fullName}/languages`, { headers: ghHeaders });
    if (!resp.ok) return {};
    const bytes = await resp.json() as Record<string, number>;
    return bytesToPercentages(bytes);
  } catch {
    return {};
  }
}

async function fetchPackageDependencies(
  fullName: string,
  ghHeaders: Record<string, string>,
): Promise<string[]> {
  try {
    const resp = await fetch(`${GH}/repos/${fullName}/contents/package.json`, { headers: ghHeaders });
    if (!resp.ok) return [];
    const meta = await resp.json() as { content?: string; encoding?: string };
    if (!meta.content) return [];
    const decoded = meta.encoding === "base64"
      ? Buffer.from(meta.content.replace(/\n/g, ""), "base64").toString("utf8")
      : meta.content;
    const pkg = JSON.parse(decoded) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

function isAuthExpired(status: number, body: string): boolean {
  return status === 401 || /bad credentials|token/i.test(body);
}

export class GitHubSyncService {
  async sync(userId: string, declaredSkills: DeclaredSkillRef[] = []): Promise<GitHubSyncResult> {
    const { data: logRow, error: logErr } = await supabaseService.client
      .from("github_sync_logs")
      .insert({
        user_id: userId,
        status: GITHUB_SYNC_STATUS.SYNCING,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (logErr) throw new AppError(logErr.message, 500);
    const logId = logRow.id as string;

    try {
      const result = await this.runSync(userId, declaredSkills, logId);
      await supabaseService.client
        .from("github_sync_logs")
        .update({
          status: GITHUB_SYNC_STATUS.SYNCED,
          completed_at: new Date().toISOString(),
          repos_fetched: result.reposFetched,
          evidence_created: result.evidenceCreated,
        })
        .eq("id", logId);
      return { ...result, logId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "GitHub sync failed";
      await supabaseService.client
        .from("github_sync_logs")
        .update({
          status: GITHUB_SYNC_STATUS.FAILED,
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", logId);
      throw err instanceof AppError ? err : new AppError(message, 502);
    }
  }

  private async runSync(
    userId: string,
    declaredSkills: DeclaredSkillRef[],
    _logId: string,
  ): Promise<Omit<GitHubSyncResult, "logId">> {
    const { data: conn, error: connErr } = await supabaseService.client
      .from("github_connections")
      .select("user_id, github_username, access_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr) throw new AppError(connErr.message, 500);
    if (!conn) {
      throw new AppError("No GitHub connection found. Please connect GitHub first.", 400);
    }

    const connection = conn as GitHubConnection;
    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${connection.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "SIJIL-backend",
    };

    const reposResp = await fetch(
      `${GH}/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers: ghHeaders },
    );

    const reposBody = await reposResp.text();
    if (!reposResp.ok) {
      if (isAuthExpired(reposResp.status, reposBody)) {
        throw new AppError("GitHub authorization expired. Please reconnect GitHub.", 401);
      }
      throw new AppError(`GitHub API error (${reposResp.status})`, 502);
    }

    const repos = JSON.parse(reposBody) as Array<Record<string, unknown>>;
    const activityRows: Array<Record<string, unknown>> = [];
    const repoRows: Array<Record<string, unknown>> = [];
    const contributorRows: Array<Record<string, unknown>> = [];
    let evidenceCreated = 0;

    const { data: existingEvidence } = await supabaseService.client
      .from("evidence_records")
      .select("external_id, status")
      .eq("user_id", userId)
      .eq("source", EVIDENCE_SOURCE.GITHUB);

    const existingEvidenceMap = new Map(
      (existingEvidence ?? []).map((e) => [e.external_id as string, e]),
    );

    for (const r of repos) {
      const repoId = r.id as number;
      const fullName = r.full_name as string;
      const language = (r.language as string) ?? null;
      const topics = Array.isArray(r.topics) ? (r.topics as string[]) : [];

      const [languageBreakdown, dependencies] = await Promise.all([
        fetchRepoLanguages(fullName, ghHeaders),
        fetchPackageDependencies(fullName, ghHeaders),
      ]);

      const learnerMetrics = await fetchLearnerCommitMetrics(fullName, connection.github_username, ghHeaders);

      let commitCount: number | null = null;
      try {
        const cResp = await fetch(`${GH}/repos/${fullName}/commits?per_page=1`, { headers: ghHeaders });
        if (cResp.ok) {
          const link = cResp.headers.get("link") ?? "";
          const m = link.match(/&page=(\d+)>; rel="last"/);
          if (m) commitCount = parseInt(m[1], 10);
        }
      } catch { /* per-repo */ }

      let prSummary: Record<string, unknown> | null = null;
      try {
        const prResp = await fetch(
          `${GH}/search/issues?q=${encodeURIComponent(`repo:${fullName} type:pr`)}&per_page=5&sort=updated`,
          { headers: ghHeaders },
        );
        if (prResp.ok) {
          const prData = await prResp.json();
          const items = (prData.items ?? []) as Array<Record<string, unknown>>;
          prSummary = {
            total: prData.total_count ?? items.length,
            recent: items.slice(0, 3).map((p) => ({
              number: p.number,
              title: p.title,
              state: p.state,
              url: p.html_url,
            })),
          };
        }
      } catch { /* per-repo */ }

      const externalId = `github:repo:${repoId}`;
      const prevEvidence = existingEvidenceMap.get(externalId);
      const status =
        prevEvidence?.status === EVIDENCE_RECORD_STATUS.IGNORED
          ? EVIDENCE_RECORD_STATUS.IGNORED
          : prevEvidence?.status === EVIDENCE_RECORD_STATUS.PROJECT
            || prevEvidence?.status === EVIDENCE_RECORD_STATUS.MAPPED
            ? EVIDENCE_RECORD_STATUS.PROJECT
            : EVIDENCE_RECORD_STATUS.UNMAPPED;

      const { error: evErr } = await supabaseService.client
        .from("evidence_records")
        .upsert(
          {
            user_id: userId,
            source: EVIDENCE_SOURCE.GITHUB,
            external_id: externalId,
            evidence_type: EVIDENCE_TYPE.PROJECT,
            status,
            repository_name: r.name as string,
            repository_url: r.html_url as string,
            repo_full_name: fullName,
            description: (r.description as string) ?? null,
            language,
            language_breakdown: languageBreakdown,
            stars: (r.stargazers_count as number) ?? 0,
            forks: (r.forks_count as number) ?? 0,
            last_updated: r.updated_at as string,
            commit_count: commitCount,
            pr_summary: prSummary,
            sync_date: new Date().toISOString(),
            suggested_skill_id: null,
            suggested_skill_name: null,
            mapped_skill_id: null,
            github_repo_id: repoId,
            metadata: {
              full_name: fullName,
              github_username: connection.github_username,
              topics,
              dependencies,
              language_breakdown: languageBreakdown,
            },
          },
          { onConflict: "user_id,external_id" },
        );

      if (!evErr && !prevEvidence) evidenceCreated += 1;

      repoRows.push({
        user_id: userId,
        github_username: connection.github_username,
        repo_id: repoId,
        repo_name: r.name,
        full_name: fullName,
        github_url: r.html_url,
        description: r.description ?? null,
        primary_language: language,
        language_breakdown: languageBreakdown,
        topics,
        dependencies,
        last_updated: r.updated_at,
        commit_count: commitCount,
        ...learnerMetrics,
        synced_at: new Date().toISOString(),
      });

      try {
        const commitsResp = await fetch(
          `${GH}/repos/${fullName}/commits?author=${connection.github_username}&per_page=15`,
          { headers: ghHeaders },
        );
        if (commitsResp.ok) {
          const commits = await commitsResp.json();
          if (Array.isArray(commits)) {
            for (const c of commits) {
              activityRows.push({
                user_id: userId,
                github_username: connection.github_username,
                repo_name: fullName,
                activity_type: "commit",
                activity_title: (c.commit?.message ?? "").split("\n")[0].slice(0, 200) || "Commit",
                activity_url: c.html_url ?? null,
                commit_hash: c.sha ?? null,
                occurred_at: c.commit?.author?.date ?? null,
                external_id: `commit:${c.sha}`,
              });
            }
          }
        }
      } catch { /* per-repo */ }

      activityRows.push({
        user_id: userId,
        github_username: connection.github_username,
        repo_name: fullName,
        activity_type: "repo",
        activity_title: `${r.name}${r.description ? ` — ${r.description}` : ""}`,
        activity_url: r.html_url,
        commit_hash: null,
        occurred_at: r.updated_at,
        external_id: `repo:${repoId}`,
      });
    }

    if (activityRows.length) {
      for (let i = 0; i < activityRows.length; i += 100) {
        const chunk = activityRows.slice(i, i + 100);
        await supabaseService.client
          .from("github_activities")
          .upsert(chunk, { onConflict: "user_id,activity_type,external_id" });
      }
    }

    if (repoRows.length) {
      const upsert = (rows: Array<Record<string, unknown>>) => supabaseService.client
        .from("github_repos")
        .upsert(rows, { onConflict: "user_id,repo_id" });
      let { error } = await upsert(repoRows);
      if (isMissingColumnError(error)) {
        const legacyRows = repoRows.map(({ learner_commit_count: _count, learner_last_commit_at: _date, ...repo }) => repo);
        ({ error } = await upsert(legacyRows));
      }
      if (error) throw new AppError(error.message, 500);
    }

    await supabaseService.client
      .from("github_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);

    return {
      status: GITHUB_SYNC_STATUS.SYNCED,
      reposFetched: repos.length,
      evidenceCreated,
      activitiesSynced: activityRows.length,
      contributorsSynced: contributorRows.length,
    };
  }

  async fillMissingLearnerCommitMetrics(userId: string, repos: Array<Record<string, unknown>>) {
    const needsMetrics = (repo: Record<string, unknown>) => typeof repo.full_name === "string"
      && (repo.learner_commit_count == null || (repo.learner_commit_count !== 0 && repo.learner_last_commit_at == null));
    if (!repos.some(needsMetrics)) return;

    const { data: connection, error } = await supabaseService.client
      .from("github_connections")
      .select("github_username, access_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !connection?.github_username || !connection.access_token) return;

    const headers = {
      Authorization: `Bearer ${connection.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "SIJIL-backend",
    };
    await Promise.all(repos.filter(needsMetrics).map(async (repo) => {
      const metrics = await fetchLearnerCommitMetrics(repo.full_name as string, connection.github_username, headers);
      repo.learner_commit_count ??= metrics.learner_commit_count;
      repo.learner_last_commit_at ??= metrics.learner_last_commit_at;
    }));
  }

  async getLatestSyncStatus(userId: string): Promise<string> {
    const { data } = await supabaseService.client
      .from("github_sync_logs")
      .select("status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.status as string) ?? GITHUB_SYNC_STATUS.NOT_SYNCED;
  }

  /** Fetch GitHub language API for repos missing breakdown and persist to DB. */
  async backfillLanguageBreakdownForRepos(
    userId: string,
    repos: Array<{ id: string; repoId: number; fullName: string }>,
  ): Promise<Map<string, Record<string, number>>> {
    const result = new Map<string, Record<string, number>>();
    if (!repos.length) return result;

    const { data: conn } = await supabaseService.client
      .from("github_connections")
      .select("access_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (!conn?.access_token) return result;

    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${conn.access_token as string}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "SIJIL-backend",
    };

    for (const repo of repos) {
      const breakdown = await fetchRepoLanguages(repo.fullName, ghHeaders);
      if (!Object.keys(breakdown).length) continue;

      result.set(repo.id, breakdown);

      await supabaseService.client
        .from("github_repos")
        .update({ language_breakdown: breakdown })
        .eq("user_id", userId)
        .eq("id", repo.id);

      await supabaseService.client
        .from("evidence_records")
        .update({
          language_breakdown: breakdown,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("github_repo_id", repo.repoId);
    }

    return result;
  }
}

export const githubSyncService = new GitHubSyncService();

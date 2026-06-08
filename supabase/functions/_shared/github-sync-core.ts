import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const GH = "https://api.github.com";

export type DeclaredSkillRef = { id: string; name: string };

export type GitHubSyncResult = {
  synced: number;
  upserted: number;
  repos: number;
  contributors: number;
};

type GitHubConnection = {
  user_id: string;
  github_username: string;
  access_token: string;
};

function matchSkill(
  lang: string | null,
  declaredSkills: DeclaredSkillRef[],
): DeclaredSkillRef | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  return (
    declaredSkills.find((s) => {
      const n = s.name.toLowerCase();
      return n === l || n.includes(l) || l.includes(n.split(/[ .&+/]/)[0]);
    }) ?? null
  );
}

export async function runGitHubSync(
  admin: SupabaseClient,
  userId: string,
  declaredSkills: DeclaredSkillRef[] = [],
): Promise<GitHubSyncResult> {
  const { data: conn, error: connErr } = await admin
    .from("github_connections")
    .select("user_id, github_username, access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (connErr) throw new Error(connErr.message);
  if (!conn) throw new Error("no github connection");

  const connection = conn as GitHubConnection;
  const ghHeaders = {
    Authorization: `Bearer ${connection.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-app",
  };

  const rows: Array<Record<string, unknown>> = [];
  const repoRows: Array<Record<string, unknown>> = [];
  const contributorRows: Array<Record<string, unknown>> = [];
  if (declaredSkills.length === 0) return { synced: 0, upserted: 0, repos: 0, contributors: 0 };

  const reposResp = await fetch(
    `${GH}/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member`,
    { headers: ghHeaders },
  );
  const repos = reposResp.ok ? await reposResp.json() : [];

  for (const r of repos) {
    const skill = matchSkill(r.language, declaredSkills);
    if (!skill) continue;

    let commitCount: number | null = null;
    try {
      const cResp = await fetch(`${GH}/repos/${r.full_name}/commits?per_page=1`, { headers: ghHeaders });
      if (cResp.ok) {
        const link = cResp.headers.get("link") ?? "";
        const m = link.match(/&page=(\d+)>; rel="last"/);
        if (m) commitCount = parseInt(m[1], 10);
        else {
          const arr = await cResp.json().catch(() => []);
          commitCount = Array.isArray(arr) ? arr.length : null;
        }
      }
    } catch { /* ignore per-repo failures */ }

    try {
      const commitsResp = await fetch(
        `${GH}/repos/${r.full_name}/commits?author=${connection.github_username}&per_page=30`,
        { headers: ghHeaders },
      );
      if (commitsResp.ok) {
        const commits = await commitsResp.json();
        if (Array.isArray(commits)) {
          for (const c of commits) {
            rows.push({
              user_id: userId,
              github_username: connection.github_username,
              repo_name: r.full_name,
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
    } catch { /* ignore per-repo commit failures */ }

    try {
      const contribResp = await fetch(`${GH}/repos/${r.full_name}/contributors?per_page=30`, { headers: ghHeaders });
      if (contribResp.ok) {
        const contribs = await contribResp.json();
        if (Array.isArray(contribs)) {
          for (const c of contribs) {
            if (!c?.login) continue;
            contributorRows.push({
              user_id: userId,
              repo_id: r.id,
              full_name: r.full_name,
              github_url: r.html_url,
              contributor_login: c.login,
              contributor_avatar_url: c.avatar_url ?? null,
              contributor_html_url: c.html_url ?? null,
              contributions: c.contributions ?? 0,
              synced_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch { /* ignore contributor failures */ }

    repoRows.push({
      user_id: userId,
      github_username: connection.github_username,
      repo_id: r.id,
      repo_name: r.name,
      full_name: r.full_name,
      github_url: r.html_url,
      description: r.description ?? null,
      primary_language: r.language ?? null,
      last_updated: r.updated_at,
      commit_count: commitCount,
      linked_skill_id: skill?.id ?? null,
      linked_skill_name: skill?.name ?? null,
      linked_at: skill ? new Date().toISOString() : null,
      synced_at: new Date().toISOString(),
    });

    rows.push({
      user_id: userId,
      github_username: connection.github_username,
      repo_name: r.full_name,
      activity_type: "repo",
      activity_title: r.name + (r.description ? ` — ${r.description}` : ""),
      activity_url: r.html_url,
      commit_hash: null,
      occurred_at: r.updated_at,
      external_id: `repo:${r.id}`,
    });
  }

  const matchedRepoFullNames = new Set(repoRows.map((r) => r.full_name as string));

  const eventsResp = await fetch(`${GH}/users/${connection.github_username}/events?per_page=50`, { headers: ghHeaders });
  const events = eventsResp.ok ? await eventsResp.json() : [];
  for (const ev of events) {
    const repoFull = ev.repo?.name as string | undefined;
    if (repoFull && !matchedRepoFullNames.has(repoFull)) continue;
    if (ev.type === "PushEvent") {
      for (const c of ev.payload?.commits ?? []) {
        rows.push({
          user_id: userId,
          github_username: connection.github_username,
          repo_name: repoFull,
          activity_type: "commit",
          activity_title: (c.message ?? "").split("\n")[0].slice(0, 200) || "Commit",
          activity_url: repoFull ? `https://github.com/${repoFull}/commit/${c.sha}` : null,
          commit_hash: c.sha,
          occurred_at: ev.created_at,
          external_id: `commit:${c.sha}`,
        });
      }
    } else if (ev.type === "PullRequestEvent") {
      const pr = ev.payload?.pull_request;
      if (pr) {
        rows.push({
          user_id: userId,
          github_username: connection.github_username,
          repo_name: repoFull,
          activity_type: "pull_request",
          activity_title: `PR #${pr.number} ${ev.payload.action}: ${pr.title}`,
          activity_url: pr.html_url,
          commit_hash: null,
          occurred_at: ev.created_at,
          external_id: `pr:${pr.id}:${ev.payload.action}:${ev.id}`,
        });
      }
    } else if (ev.type === "IssuesEvent") {
      const iss = ev.payload?.issue;
      if (iss) {
        rows.push({
          user_id: userId,
          github_username: connection.github_username,
          repo_name: repoFull,
          activity_type: "issue",
          activity_title: `Issue #${iss.number} ${ev.payload.action}: ${iss.title}`,
          activity_url: iss.html_url,
          commit_hash: null,
          occurred_at: ev.created_at,
          external_id: `issue:${iss.id}:${ev.payload.action}:${ev.id}`,
        });
      }
    } else {
      rows.push({
        user_id: userId,
        github_username: connection.github_username,
        repo_name: repoFull,
        activity_type: "event",
        activity_title: ev.type,
        activity_url: repoFull ? `https://github.com/${repoFull}` : null,
        commit_hash: null,
        occurred_at: ev.created_at,
        external_id: `event:${ev.id}`,
      });
    }
  }

  const prSearchResp = await fetch(
    `${GH}/search/issues?q=${encodeURIComponent(`author:${connection.github_username} type:pr`)}&per_page=20&sort=updated`,
    { headers: ghHeaders },
  );
  if (prSearchResp.ok) {
    const prs = await prSearchResp.json();
    for (const pr of (prs.items ?? [])) {
      const repoFull = pr.repository_url?.replace("https://api.github.com/repos/", "");
      if (repoFull && !matchedRepoFullNames.has(repoFull)) continue;
      rows.push({
        user_id: userId,
        github_username: connection.github_username,
        repo_name: repoFull,
        activity_type: "pull_request",
        activity_title: `PR #${pr.number}: ${pr.title} (${pr.state})`,
        activity_url: pr.html_url,
        commit_hash: null,
        occurred_at: pr.updated_at,
        external_id: `pr-search:${pr.id}`,
      });
    }
  }

  let inserted = 0;
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error: insErr, count } = await admin
        .from("github_activities")
        .upsert(chunk, { onConflict: "user_id,activity_type,external_id", count: "exact" });
      if (insErr) throw new Error(insErr.message);
      inserted += count ?? chunk.length;
    }
  }

  let reposUpserted = 0;
  if (repoRows.length) {
    const { data: existing } = await admin
      .from("github_repos")
      .select("repo_id, linked_skill_id, linked_skill_name, linked_at")
      .eq("user_id", userId);
    const existingMap = new Map<number, { linked_skill_id: string | null; linked_skill_name: string | null; linked_at: string | null }>(
      (existing ?? []).map((e) => [Number(e.repo_id), e]),
    );
    const merged = repoRows.map((r) => {
      const prev = existingMap.get(Number(r.repo_id));
      if (!r.linked_skill_id && prev?.linked_skill_id) {
        return {
          ...r,
          linked_skill_id: prev.linked_skill_id,
          linked_skill_name: prev.linked_skill_name,
          linked_at: prev.linked_at,
        };
      }
      return r;
    });
    const { error: repoErr, count } = await admin
      .from("github_repos")
      .upsert(merged, { onConflict: "user_id,repo_id", count: "exact" });
    if (repoErr) throw new Error(repoErr.message);
    reposUpserted = count ?? merged.length;
  }

  let contributorsUpserted = 0;
  if (contributorRows.length) {
    const repoIds = Array.from(new Set(contributorRows.map((c) => Number(c.repo_id))));
    await admin.from("github_repo_contributors").delete().eq("user_id", userId).in("repo_id", repoIds);
    for (let i = 0; i < contributorRows.length; i += 100) {
      const chunk = contributorRows.slice(i, i + 100);
      const { error: cErr, count } = await admin
        .from("github_repo_contributors")
        .upsert(chunk, { onConflict: "user_id,repo_id,contributor_login", count: "exact" });
      if (cErr) throw new Error(cErr.message);
      contributorsUpserted += count ?? chunk.length;
    }
  }

  await admin
    .from("github_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return {
    synced: rows.length,
    upserted: inserted,
    repos: reposUpserted,
    contributors: contributorsUpserted,
  };
}

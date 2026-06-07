import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const GH = "https://api.github.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uerr } = await userClient.auth.getUser(token);
    if (uerr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: connErr } = await admin
      .from("github_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (connErr) return json({ error: connErr.message }, 500);
    if (!conn) return json({ error: "no github connection" }, 404);

    const ghHeaders = {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "SIJIL-app",
    };

    const rows: Array<Record<string, unknown>> = [];
    const repoRows: Array<Record<string, unknown>> = [];
    const contributorRows: Array<Record<string, unknown>> = [];

    // 1. Repos (owned + collaborator, recent)
    const reposResp = await fetch(`${GH}/user/repos?per_page=30&sort=updated&affiliation=owner,collaborator`, { headers: ghHeaders });
    const repos = reposResp.ok ? await reposResp.json() : [];

    // Body parser used to retrieve declared skills passed from client (for mapping).
    let declaredSkills: Array<{ id: string; name: string }> = [];
    try {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.declared_skills)) declaredSkills = body.declared_skills;
    } catch { /* no body */ }

    const matchSkill = (lang: string | null) => {
      if (!lang) return null;
      const l = lang.toLowerCase();
      // Match if declared skill name contains the language token (e.g. "React.js" matches "React")
      const found = declaredSkills.find((s) => {
        const n = s.name.toLowerCase();
        return n === l || n.includes(l) || l.includes(n.split(/[ .&+/]/)[0]);
      });
      return found ?? null;
    };

    for (const r of repos) {
      // Fetch commit count cheaply via per_page=1 and parse Link header rel=last
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

      // Fetch contributors for this repo so peer reviews can be gated to actual collaborators.
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

      const skill = matchSkill(r.language);
      repoRows.push({
        user_id: userId,
        github_username: conn.github_username,
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
        github_username: conn.github_username,
        repo_name: r.full_name,
        activity_type: "repo",
        activity_title: r.name + (r.description ? ` — ${r.description}` : ""),
        activity_url: r.html_url,
        commit_hash: null,
        occurred_at: r.updated_at,
        external_id: `repo:${r.id}`,
      });
    }

    // 2. Recent events (commits, PRs, issues, pushes)
    const eventsResp = await fetch(`${GH}/users/${conn.github_username}/events?per_page=50`, { headers: ghHeaders });
    const events = eventsResp.ok ? await eventsResp.json() : [];
    for (const ev of events) {
      const repoFull = ev.repo?.name as string | undefined;
      if (ev.type === "PushEvent") {
        const commits = ev.payload?.commits ?? [];
        for (const c of commits) {
          rows.push({
            user_id: userId,
            github_username: conn.github_username,
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
            github_username: conn.github_username,
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
            github_username: conn.github_username,
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
          github_username: conn.github_username,
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

    // 3. Recent PRs authored by user (search API, public + accessible)
    const prSearchResp = await fetch(
      `${GH}/search/issues?q=${encodeURIComponent(`author:${conn.github_username} type:pr`)}&per_page=20&sort=updated`,
      { headers: ghHeaders },
    );
    if (prSearchResp.ok) {
      const prs = await prSearchResp.json();
      for (const pr of (prs.items ?? [])) {
        const repoFull = pr.repository_url?.replace("https://api.github.com/repos/", "");
        rows.push({
          user_id: userId,
          github_username: conn.github_username,
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
      // Upsert in chunks of 100
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error: insErr, count } = await admin
          .from("github_activities")
          .upsert(chunk, { onConflict: "user_id,activity_type,external_id", count: "exact" });
        if (insErr) {
          console.error("upsert err", insErr);
          return json({ error: insErr.message }, 500);
        }
        inserted += count ?? chunk.length;
      }
    }

    // Upsert structured repos. Preserve manual skill links: only overwrite linked_skill_*
    // when the new sync produced an automatic match; otherwise keep existing values.
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
      if (repoErr) {
        console.error("repo upsert err", repoErr);
        return json({ error: repoErr.message }, 500);
      }
      reposUpserted = count ?? merged.length;
    }

    // Upsert repository contributors so peer reviews can verify shared context.
    let contributorsUpserted = 0;
    if (contributorRows.length) {
      // Replace existing contributor records for these repos to keep set fresh.
      const repoIds = Array.from(new Set(contributorRows.map((c) => Number(c.repo_id))));
      await admin.from("github_repo_contributors").delete().eq("user_id", userId).in("repo_id", repoIds);
      for (let i = 0; i < contributorRows.length; i += 100) {
        const chunk = contributorRows.slice(i, i + 100);
        const { error: cErr, count } = await admin
          .from("github_repo_contributors")
          .upsert(chunk, { onConflict: "user_id,repo_id,contributor_login", count: "exact" });
        if (cErr) {
          console.error("contributor upsert err", cErr);
          return json({ error: cErr.message }, 500);
        }
        contributorsUpserted += count ?? chunk.length;
      }
    }

    await admin
      .from("github_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);

    return json({ ok: true, synced: rows.length, upserted: inserted, repos: reposUpserted, contributors: contributorsUpserted });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { runGitHubSync } from "../_shared/github-sync-core.ts";

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

    const { code, state, redirect_uri, client_id: bodyClientId } = await req.json();
    if (!code || !state || !redirect_uri) return json({ error: "missing params" }, 400);

    let stateUserId = "";
    try { stateUserId = atob(state).split(".")[0]; } catch { /* ignore */ }
    if (stateUserId !== userId) return json({ error: "state mismatch" }, 400);

    const clientId = Deno.env.get("GITHUB_OAUTH_CLIENT_ID")?.trim();
    const clientSecret = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET")?.trim();
    if (!clientId || !clientSecret) {
      return json({
        error: "GitHub OAuth not configured on server. Run: supabase secrets set GITHUB_OAUTH_CLIENT_ID=... and GITHUB_OAUTH_CLIENT_SECRET=...",
      }, 500);
    }

    if (bodyClientId && bodyClientId !== clientId) {
      return json({
        error: `GitHub client_id mismatch: frontend sent "${bodyClientId}" but Supabase secret GITHUB_OAUTH_CLIENT_ID is "${clientId}". Update .env.local VITE_GITHUB_CLIENT_ID to match, then restart npm run dev.`,
      }, 400);
    }

    // GitHub requires form-urlencoded body for token exchange
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code),
        redirect_uri: String(redirect_uri),
      }).toString(),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      console.error("token exchange failed", { status: tokenResp.status, tokenData, clientId, redirect_uri });
      const detail = tokenData.error_description || tokenData.error || "token exchange failed";
      return json({
        error: `${detail}. Ensure GITHUB_OAUTH_CLIENT_ID (${clientId}) and GITHUB_OAUTH_CLIENT_SECRET belong to the same GitHub OAuth app, and callback URL is registered as: ${redirect_uri}`,
      }, 400);
    }
    const accessToken = tokenData.access_token as string;
    const scopes = (tokenData.scope as string) || "";

    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "SIJIL-app",
      },
    });
    const ghUser = await userResp.json();
    if (!userResp.ok) {
      return json({ error: "failed to fetch github user", detail: ghUser }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existingLink } = await admin
      .from("github_connections")
      .select("user_id")
      .eq("github_user_id", ghUser.id)
      .maybeSingle();

    if (existingLink && existingLink.user_id !== userId) {
      return json({
        error: "This GitHub account is already linked to another SIJIL user.",
      }, 409);
    }

    const githubProfileUrl = `https://github.com/${ghUser.login}`;
    const now = new Date().toISOString();

    const { error: upErr } = await admin.from("github_connections").upsert({
      user_id: userId,
      github_user_id: ghUser.id,
      github_username: ghUser.login,
      github_avatar_url: ghUser.avatar_url,
      scopes,
      access_token: accessToken,
      token_type: "bearer",
      connected_at: now,
    }, { onConflict: "user_id" });

    if (upErr) {
      console.error("upsert connection failed", upErr);
      return json({ error: upErr.message }, 500);
    }

    await admin.from("learner_profiles").update({ github_url: githubProfileUrl }).eq("user_id", userId);

    let declaredSkills: Array<{ id: string; name: string }> = [];
    try {
      const { data: skillRows } = await admin
        .from("declared_skills")
        .select("id, name")
        .eq("user_id", userId);
      if (skillRows) declaredSkills = skillRows.map((s) => ({ id: s.id, name: s.name }));
    } catch { /* skills optional */ }

    let sync = { synced: 0, repos: 0, contributors: 0 };
    try {
      const syncResult = await runGitHubSync(admin, userId, declaredSkills);
      sync = {
        synced: syncResult.synced,
        repos: syncResult.repos,
        contributors: syncResult.contributors,
      };
    } catch (syncErr) {
      console.error("initial github sync failed", syncErr);
    }

    return json({
      ok: true,
      github_username: ghUser.login,
      github_avatar_url: ghUser.avatar_url,
      scopes,
      sync,
    });
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

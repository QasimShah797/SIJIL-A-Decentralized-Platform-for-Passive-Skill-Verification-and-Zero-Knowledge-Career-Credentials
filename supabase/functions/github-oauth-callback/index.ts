import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

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
    const { data: claims, error: cerr } = await userClient.auth.getClaims(token);
    if (cerr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { code, state, redirect_uri } = await req.json();
    if (!code || !state || !redirect_uri) return json({ error: "missing params" }, 400);

    // Verify state encodes the same user
    let stateUserId = "";
    try { stateUserId = atob(state).split(".")[0]; } catch { /* ignore */ }
    if (stateUserId !== userId) return json({ error: "state mismatch" }, 400);

    const clientId = Deno.env.get("GITHUB_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "GitHub OAuth not configured" }, 500);

    // Exchange code for token
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri,
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      console.error("token exchange failed", tokenData);
      return json({ error: tokenData.error_description || "token exchange failed" }, 400);
    }
    const accessToken = tokenData.access_token as string;
    const scopes = (tokenData.scope as string) || "";

    // Fetch GitHub user profile
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

    // Store using service role (bypasses RLS — we trust the verified userId)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: upErr } = await admin.from("github_connections").upsert({
      user_id: userId,
      github_user_id: ghUser.id,
      github_username: ghUser.login,
      github_avatar_url: ghUser.avatar_url,
      scopes,
      access_token: accessToken,
      token_type: "bearer",
      connected_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (upErr) {
      console.error("upsert connection failed", upErr);
      return json({ error: upErr.message }, 500);
    }

    return json({
      ok: true,
      github_username: ghUser.login,
      github_avatar_url: ghUser.avatar_url,
      scopes,
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

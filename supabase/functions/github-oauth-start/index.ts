import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const redirectUri = (body.redirect_uri as string) || "";
    if (!redirectUri) return json({ error: "redirect_uri required" }, 400);

    const clientId = Deno.env.get("GITHUB_OAUTH_CLIENT_ID");
    if (!clientId) return json({ error: "GITHUB_OAUTH_CLIENT_ID not configured" }, 500);

    // state binds the callback to this user; signed via service role secret
    const stateRaw = `${userId}.${crypto.randomUUID()}`;
    const stateB64 = btoa(stateRaw);

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user user:email repo");
    url.searchParams.set("state", stateB64);
    url.searchParams.set("allow_signup", "true");

    return json({ authorize_url: url.toString(), state: stateB64 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

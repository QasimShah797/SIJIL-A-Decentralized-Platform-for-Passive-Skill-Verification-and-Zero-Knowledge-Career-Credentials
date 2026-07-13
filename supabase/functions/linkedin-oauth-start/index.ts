import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  buildLinkedInAuthorizeUrl,
  generateCodeVerifier,
  generateSecureOAuthState,
  getLinkedInOAuthConfig,
  hasLinkedInOAuthSecrets,
  saveOAuthState,
  serviceAdmin,
} from "../_shared/linkedin-oauth-core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "status") {
      const secretsOk = hasLinkedInOAuthSecrets();
      return json({
        configured: secretsOk,
        oauth_configured: secretsOk,
      });
    }

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

    const config = getLinkedInOAuthConfig();
    if (!config) {
      return json({
        configured: false,
        error: "LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI in Supabase secrets.",
      }, 503);
    }

    const returnTo =
      typeof body.return_to === "string" && body.return_to.trim()
        ? body.return_to.trim()
        : "/learner/complete-profile";
    const state = generateSecureOAuthState();
    const codeVerifier = generateCodeVerifier();
    const admin = serviceAdmin();

    await saveOAuthState(admin, userId, state, codeVerifier, returnTo);

    const authorizeUrl = await buildLinkedInAuthorizeUrl(config, state, codeVerifier);

    return json({
      configured: true,
      authorize_url: authorizeUrl,
    });
  } catch (e) {
    console.error("linkedin-oauth-start error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

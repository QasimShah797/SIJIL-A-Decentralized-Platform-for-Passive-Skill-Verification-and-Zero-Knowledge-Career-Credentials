/**
 * @deprecated LinkedIn OAuth is no longer used by the learner UI.
 * Learners enter a manual LinkedIn profile URL in learner_profiles.linkedin_url instead.
 * This function is retained for reference and may be removed in a future cleanup.
 */
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import {
  buildFrontendRedirect,
  completeLinkedInOAuthExchange,
  getLinkedInOAuthConfig,
  mapOAuthErrorCode,
  type LinkedInCallbackLog,
} from "../_shared/linkedin-oauth-core.ts";

/**
 * LinkedIn OAuth callback — public browser redirect endpoint.
 * NO Supabase Authorization header. Learner identity comes from linkedin_oauth_states.
 *
 * LinkedIn redirects: GET ?code=...&state=... (or ?error=...&state=...)
 * Must be deployed with: --no-verify-jwt
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const log: LinkedInCallbackLog = {
      callbackReached: true,
      method: "GET",
    };

    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    log.codeExists = !!code;
    log.stateExists = !!state;

    console.log("LinkedIn OAuth callback reached", {
      method: log.method,
      codeExists: log.codeExists,
      stateExists: log.stateExists,
    });

    if (oauthError) {
      const reason = mapOAuthErrorCode(null, oauthError);
      log.redirectType = "error";
      log.reason = reason;
      console.error("LinkedIn OAuth denied", {
        error: oauthError,
        error_description: oauthErrorDescription ?? null,
        redirectType: log.redirectType,
        reason: log.reason,
      });
      return redirect(buildFrontendRedirect("error", "/learner/complete-profile", reason));
    }

    if (!code || !state) {
      if (!code) console.error("LinkedIn OAuth callback missing code");
      if (!state) console.error("LinkedIn OAuth callback missing state");
      log.redirectType = "error";
      log.reason = "missing_callback_parameters";
      console.log("LinkedIn OAuth callback redirect", log);
      return redirect(
        buildFrontendRedirect("error", "/learner/complete-profile", "missing_callback_parameters"),
      );
    }

    if (!getLinkedInOAuthConfig()) {
      log.redirectType = "error";
      log.reason = "server_not_configured";
      console.error("LinkedIn OAuth callback: server not configured", log);
      return redirect(
        buildFrontendRedirect("error", "/learner/complete-profile", "server_not_configured"),
      );
    }

    try {
      const result = await completeLinkedInOAuthExchange(code, state, log);

      if (log.connectionUpsert !== "success" || !result.linkedin_member_id) {
        log.redirectType = "error";
        log.reason = "connection_save_failed";
        console.error("LinkedIn OAuth callback: connection not saved", {
          connectionUpsert: log.connectionUpsert,
          linkedinSubExists: log.linkedinSubExists,
        });
        return redirect(
          buildFrontendRedirect("error", "/learner/complete-profile", "connection_save_failed"),
        );
      }

      log.redirectType = "connected";
      console.log("LinkedIn OAuth callback success", {
        storedStateFound: log.storedStateFound,
        stateUserId: log.stateUserId,
        tokenExchangeStatus: log.tokenExchangeStatus,
        userinfoStatus: log.userinfoStatus,
        linkedinSubExists: log.linkedinSubExists,
        connectionUpsert: log.connectionUpsert,
        databaseSaveSuccess: true,
        redirectType: log.redirectType,
        linkedin_member_id: result.linkedin_member_id,
        profile_url_returned: result.profile_url !== null,
      });
      const redirectUrl = buildFrontendRedirect("connected", "/learner/complete-profile");
      console.log("LinkedIn OAuth final redirect", { redirectType: "connected", url: redirectUrl });
      return redirect(redirectUrl);
    } catch (e) {
      const reason = mapOAuthErrorCode(e);
      log.redirectType = "error";
      log.reason = reason;
      console.error("LinkedIn OAuth GET callback failed", {
        storedStateFound: log.storedStateFound,
        stateUserId: log.stateUserId,
        stateExpired: log.stateExpired,
        tokenExchangeStatus: log.tokenExchangeStatus,
        userinfoStatus: log.userinfoStatus,
        linkedinSubExists: log.linkedinSubExists,
        connectionUpsert: log.connectionUpsert,
        redirectType: log.redirectType,
        reason: log.reason,
        error: e instanceof Error ? e.message : String(e),
      });
      const redirectUrl = buildFrontendRedirect("error", "/learner/complete-profile", reason);
      console.log("LinkedIn OAuth final redirect", { redirectType: "error", url: redirectUrl });
      return redirect(redirectUrl);
    }
  }

  // SPA fallback: POST { code, state } — still no JWT; state validates learner
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const code = body.code;
      const state = body.state;

      if (!code || !state) {
        return json({ error: "missing_callback_parameters" }, 400);
      }

      const result = await completeLinkedInOAuthExchange(String(code), String(state));

      return json({
        ok: true,
        linkedin_member_id: result.linkedin_member_id,
        display_name: result.display_name,
        profile_url: result.profile_url,
        avatar_url: result.avatar_url,
        return_to: result.return_to,
      });
    } catch (e) {
      console.error("LinkedIn OAuth POST callback failed", e);
      const reason = mapOAuthErrorCode(e);
      return json({ error: reason }, 400);
    }
  }

  return json({ error: "method_not_allowed" }, 405);
});

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: location },
  });
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

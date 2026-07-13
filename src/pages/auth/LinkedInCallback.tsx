import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { getLinkedInOAuthReturnTo } from "@/lib/linkedin-env";
import { completeLinkedInOAuth } from "@/lib/linkedin-integration";
import { supabase } from "@/integrations/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  user_denied: "You cancelled LinkedIn authorization.",
  state_expired: "The connection session expired. Please try again.",
  state_invalid: "Invalid OAuth state. Please try again.",
  already_linked: "This LinkedIn account is already linked to another SIJIL user.",
  token_exchange: "Could not exchange the authorization code with LinkedIn.",
  userinfo_failed: "Could not fetch your LinkedIn profile.",
  missing_params: "LinkedIn did not return the required authorization data.",
};

/**
 * SPA fallback when LINKEDIN_REDIRECT_URI points here instead of the edge function.
 * Primary flow: LinkedIn redirects to linkedin-oauth-callback edge function → FRONTEND_URL.
 */
export default function LinkedInCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Completing LinkedIn connection…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const fallbackReturnTo = getLinkedInOAuthReturnTo();

      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error");

        if (err) {
          const returnTo = fallbackReturnTo;
          navigate(`${returnTo}?linkedin=error&reason=user_denied`, { replace: true });
          return;
        }
        if (!code || !state) throw new Error("Missing OAuth code or state");

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("You must be signed in to connect LinkedIn");

        setMsg("Exchanging authorization code…");
        const result = await completeLinkedInOAuth(code, state);
        const returnTo = result.return_to ?? fallbackReturnTo;

        navigate(`${returnTo}?linkedin=connected`, { replace: true });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "oauth_failed";
        const code = ERROR_MESSAGES[errMsg] ? errMsg : "oauth_failed";
        toast({
          title: "LinkedIn connection failed",
          description: ERROR_MESSAGES[code] ?? formatSupabaseError(e),
          variant: "destructive",
        });
        navigate(`${fallbackReturnTo}?linkedin=error&reason=${code}`, { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <div className="text-center">
        <div className="animate-pulse text-foreground font-medium mb-1">SIJIL</div>
        <div className="text-sm">{msg}</div>
      </div>
    </div>
  );
}

function formatSupabaseError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

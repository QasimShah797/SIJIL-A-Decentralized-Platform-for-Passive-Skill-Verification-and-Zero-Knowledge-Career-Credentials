import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  completeOAuthSignInForIntent,
  consumeOAuthSignInIntent,
  hasOAuthReturnInUrl,
  oauthCallbackErrorFromUrl,
  peekOAuthSignInIntent,
  recoverSessionFromUrl,
  type OAuthSignInIntent,
} from "@/lib/oauth-signin";
import { formatSupabaseError } from "@/lib/utils";

export function useFinishOAuthReturn() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const ran = useRef(false);
  const [active, setActive] = useState(() =>
    typeof window === "undefined" ? false : hasOAuthReturnInUrl(),
  );
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    if (!hasOAuthReturnInUrl() || ran.current) return;
    ran.current = true;

    if (window.opener && window.opener !== window) {
      window.opener.postMessage(
        { type: "sijil-oauth-return", url: window.location.href },
        window.location.origin,
      );
      window.close();
      return;
    }

    let intent: OAuthSignInIntent = peekOAuthSignInIntent();
    setActive(true);

    void (async () => {
      try {
        const callbackError = oauthCallbackErrorFromUrl();
        if (callbackError) throw new Error(callbackError);

        setMessage("Completing sign-in…");
        const session = await recoverSessionFromUrl();
        if (!session?.user) {
          throw new Error("Sign-in did not complete. Please try again.");
        }

        intent = consumeOAuthSignInIntent();
        setMessage(intent === "admin" ? "Verifying administrator access…" : "Setting up your account…");
        const destination = await completeOAuthSignInForIntent(session.user, intent);
        await refreshRoles();
        toast({ title: "Signed in" });
        navigate(destination, { replace: true });
      } catch (err) {
        toast({
          title: intent === "admin" ? "Admin access denied" : "Sign-in failed",
          description: formatSupabaseError(err),
          variant: "destructive",
        });
        try {
          consumeOAuthSignInIntent();
        } catch {
          /* ignore */
        }
        await supabase.auth.signOut();
        window.history.replaceState(null, "", window.location.pathname);
        setActive(false);
        navigate(intent === "admin" ? "/login/admin" : "/login/learner", { replace: true });
      }
    })();
  }, [navigate, refreshRoles]);

  return { active, message };
}

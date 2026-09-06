import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  completeOAuthLearnerSignIn,
  hasOAuthReturnInUrl,
  oauthCallbackErrorFromUrl,
  recoverSessionFromUrl,
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

        setMessage("Setting up your account…");
        const destination = await completeOAuthLearnerSignIn(session.user);
        await refreshRoles();
        toast({ title: "Signed in" });
        navigate(destination, { replace: true });
      } catch (err) {
        toast({
          title: "Sign-in failed",
          description: formatSupabaseError(err),
          variant: "destructive",
        });
        await supabase.auth.signOut();
        window.history.replaceState(null, "", window.location.pathname);
        setActive(false);
        navigate("/login/learner", { replace: true });
      }
    })();
  }, [navigate, refreshRoles]);

  return { active, message };
}

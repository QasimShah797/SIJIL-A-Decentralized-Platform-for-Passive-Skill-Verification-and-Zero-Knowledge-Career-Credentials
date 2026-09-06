import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { useFinishOAuthReturn } from "@/hooks/useFinishOAuthReturn";
import { hasOAuthReturnInUrl } from "@/lib/oauth-signin";

export default function AuthCallback() {
  const navigate = useNavigate();
  const oauthReturn = useFinishOAuthReturn();

  useEffect(() => {
    if (!oauthReturn.active && !hasOAuthReturnInUrl()) {
      navigate("/login/learner", { replace: true });
    }
  }, [navigate, oauthReturn.active]);

  return (
    <AuthEntryLayout>
      <p className="auth-page-eyebrow">Secure sign in</p>
      <h1 className="auth-page-title">Continue to SIJIL</h1>
      <p className="auth-page-subtitle">
        {oauthReturn.active ? oauthReturn.message : "Completing sign-in…"}
      </p>
    </AuthEntryLayout>
  );
}

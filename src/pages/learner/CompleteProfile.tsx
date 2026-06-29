import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchLearnerProfileRow, isInstitutionProvisionedProfile } from "@/lib/db/learner-profile";
import InstitutionCompleteProfile from "./InstitutionCompleteProfile";
import SelfSignupCompleteProfile from "./SelfSignupCompleteProfile";

/** Routes learners to institution-provisioned or self-signup complete profile flow. */
export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"loading" | "institution" | "self_signup">("loading");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login/learner", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      const row = await fetchLearnerProfileRow(user.id);
      if (cancelled) return;

      if (!row) {
        navigate("/signup/learner", { replace: true });
        return;
      }

      setMode(isInstitutionProvisionedProfile(row) ? "institution" : "self_signup");
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  if (authLoading || mode === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="text-center">
          <div className="animate-pulse text-foreground font-medium mb-1">SIJIL</div>
          <div className="text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  if (mode === "institution") {
    return <InstitutionCompleteProfile />;
  }

  return <SelfSignupCompleteProfile />;
}

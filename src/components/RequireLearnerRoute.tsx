import { useEffect, useState, ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isDeniedAccess } from "@/lib/auth-helpers";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { IDENTITY_SETUP_PATH } from "@/lib/ssi/onboarding";
import { getSsiIdentityApi } from "@/services/api/ssi.api";
import sijilLogo from "@/assets/sijil-logo.png";

function AuthLoading() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function LearnerAccessDenied({
  title,
  description,
  showLearnerLogin,
}: {
  title: string;
  description: string;
  showLearnerLogin?: boolean;
}) {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background via-background to-secondary/40 px-4">
      <div className="max-w-md w-full rounded-2xl border border-border/70 bg-card/95 p-8 text-center shadow-lg">
        <Link to="/" className="inline-flex flex-col items-center mb-6">
          <img src={sijilLogo} alt="SIJIL" className="h-14 w-14 object-contain" />
          <span className="mt-2 text-lg font-semibold tracking-tight">SIJIL</span>
        </Link>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted/60"
          >
            Sign out
          </button>
          {showLearnerLogin && (
            <Link
              to="/login/learner"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Learner sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function RequireLearnerRoute({
  children,
  requireCompleteProfile = true,
  requireSsiIdentity = true,
}: {
  children: ReactNode;
  requireCompleteProfile?: boolean;
  /** When true, learners without a bound DID are sent to Privacy & Security. */
  requireSsiIdentity?: boolean;
}) {
  const { user, loading, rolesReady } = useAuth();
  const userId = user?.id;
  const loc = useLocation();
  const onIdentitySetup = loc.pathname.startsWith(IDENTITY_SETUP_PATH);
  const [access, setAccess] = useState<
    "pending" | "allowed" | "wrong_role" | "no_profile" | "incomplete_profile" | "incomplete_ssi"
  >("pending");

  useEffect(() => {
    if (loading || !rolesReady) return;
    if (!userId) {
      setAccess("pending");
      return;
    }

    let cancelled = false;
    verifyLearnerAccess(userId).then(async (result) => {
      if (cancelled) return;
      if (isDeniedAccess(result)) {
        setAccess(result.reason);
        return;
      }
      if (requireCompleteProfile && !result.profileComplete) {
        setAccess("incomplete_profile");
        return;
      }
      if (!requireSsiIdentity || onIdentitySetup) {
        setAccess("allowed");
        return;
      }
      try {
        const identity = await getSsiIdentityApi();
        if (cancelled) return;
        // Only gate on a definitive empty DID. API outages must not lock learners out.
        if (identity && identity.tableReady && !identity.did) {
          setAccess("incomplete_ssi");
          return;
        }
      } catch {
        if (cancelled) return;
      }
      setAccess("allowed");
    });

    return () => {
      cancelled = true;
    };
  }, [userId, loading, rolesReady, requireCompleteProfile, requireSsiIdentity, onIdentitySetup]);

  if (loading || (user && access === "pending")) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/login/learner" state={{ from: loc.pathname }} replace />;
  }

  if (access === "wrong_role") {
    return (
      <LearnerAccessDenied
        title="Access not allowed"
        description="This account does not have learner access."
        showLearnerLogin
      />
    );
  }

  if (access === "no_profile") {
    return (
      <LearnerAccessDenied
        title="Learner profile not found"
        description="Your account is missing a learner profile. Please sign up again or contact support."
      />
    );
  }

  if (access === "incomplete_profile") {
    return <Navigate to="/learner/complete-profile" replace />;
  }

  if (access === "incomplete_ssi") {
    return <Navigate to={IDENTITY_SETUP_PATH} replace />;
  }

  return <>{children}</>;
}

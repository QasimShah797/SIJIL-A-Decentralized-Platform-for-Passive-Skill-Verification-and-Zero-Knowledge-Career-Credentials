import { useEffect, useState, ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { verifyLearnerAccess } from "@/lib/learner-auth";
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
}: {
  children: ReactNode;
  requireCompleteProfile?: boolean;
}) {
  const { user, loading, rolesReady } = useAuth();
  const userId = user?.id;
  const loc = useLocation();
  const [access, setAccess] = useState<
    "pending" | "allowed" | "wrong_role" | "no_profile" | "not_activated" | "incomplete_profile"
  >("pending");

  useEffect(() => {
    if (loading || !rolesReady) return;
    if (!userId) {
      setAccess("pending");
      return;
    }

    let cancelled = false;
    verifyLearnerAccess(userId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setAccess(result.reason);
        return;
      }
      if (requireCompleteProfile && !result.profileComplete) {
        setAccess("incomplete_profile");
        return;
      }
      setAccess("allowed");
    });

    return () => {
      cancelled = true;
    };
  }, [userId, loading, rolesReady, requireCompleteProfile]);

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

  if (access === "not_activated") {
    return (
      <LearnerAccessDenied
        title="Account not activated"
        description="Please activate your account using the activation link provided by your institution."
        showLearnerLogin
      />
    );
  }

  if (access === "incomplete_profile") {
    return <Navigate to="/learner/complete-profile" replace />;
  }

  return <>{children}</>;
}

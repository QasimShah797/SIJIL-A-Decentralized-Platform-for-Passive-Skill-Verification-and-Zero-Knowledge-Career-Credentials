import { useEffect, useState, ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { verifyInstitutionAccess } from "@/lib/institution-auth";
import sijilLogo from "@/assets/sijil-logo.png";

function AuthLoading() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function InstitutionAccessDenied({
  title,
  description,
}: {
  title: string;
  description: string;
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
          <Link
            to="/login/institution"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Institution sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RequireInstitutionRoute({ children }: { children: ReactNode }) {
  const { user, loading, rolesReady } = useAuth();
  const userId = user?.id;
  const loc = useLocation();
  const [access, setAccess] = useState<"pending" | "allowed" | "wrong_role" | "inactive" | "no_profile">(
    "pending",
  );

  useEffect(() => {
    if (loading || !rolesReady) return;
    if (!userId) {
      setAccess("pending");
      return;
    }

    let cancelled = false;
    verifyInstitutionAccess(userId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAccess("allowed");
        return;
      }
      setAccess(result.reason);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, loading, rolesReady]);

  if (loading || (user && access === "pending")) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/login/institution" state={{ from: loc.pathname }} replace />;
  }

  if (access === "wrong_role") {
    return (
      <InstitutionAccessDenied
        title="Access not allowed"
        description="This account does not have institution access. Sign in with an institution account or contact SIJIL support."
      />
    );
  }

  if (access === "no_profile") {
    return (
      <InstitutionAccessDenied
        title="Institution profile missing"
        description="Your account is missing an institution profile. Contact SIJIL support to complete setup."
      />
    );
  }

  if (access === "inactive") {
    return (
      <InstitutionAccessDenied
        title="Institution account inactive"
        description="Your institution account is not active yet. Contact SIJIL support."
      />
    );
  }

  return <>{children}</>;
}

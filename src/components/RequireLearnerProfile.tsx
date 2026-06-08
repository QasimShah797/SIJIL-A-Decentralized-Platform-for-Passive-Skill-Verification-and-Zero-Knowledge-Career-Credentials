import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isLearnerProfileComplete } from "@/lib/db/learner-profile";

export function RequireLearnerProfile({ children }: { children: React.ReactNode }) {
  const { user, role, loading: authLoading } = useAuth();
  const loc = useLocation();
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      setChecking(false);
      return;
    }
    if (role !== "learner") {
      setComplete(true);
      setChecking(false);
      return;
    }
    let mounted = true;
    isLearnerProfileComplete(user.id).then((done) => {
      if (mounted) {
        setComplete(done);
        setChecking(false);
      }
    });
    return () => { mounted = false; };
  }, [user, role, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="text-center">
          <div className="animate-pulse text-foreground font-medium mb-1">SIJIL</div>
          <div className="text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  if (role === "learner" && !complete) {
    return <Navigate to="/learner/complete-profile" state={{ from: loc.pathname }} replace />;
  }

  return <>{children}</>;
}

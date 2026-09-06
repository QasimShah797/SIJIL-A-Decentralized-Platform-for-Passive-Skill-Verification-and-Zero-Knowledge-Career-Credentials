import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DotProgress } from "@/components/sijil/DotProgress";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { toast } from "@/hooks/use-toast";
import { getGitHubOAuthReturnTo, loadGitHubOAuthContext } from "@/lib/github-env";
import {
  buildSkillsForGitHubSync,
  completeGitHubOAuth,
  syncGitHubPortfolio,
} from "@/lib/github-integration";
import { fetchDeclaredSkills } from "@/lib/db/skills";
import { fetchCredentials } from "@/lib/db/credentials";
import { supabase } from "@/integrations/supabase/client";
import { completeGitHubPageSignIn, isGitHubSignInState } from "@/lib/github-signin";
import { completeOAuthLearnerSignIn } from "@/lib/oauth-signin";

export default function GitHubCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Completing GitHub connection…");
  const [step, setStep] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const returnTo = loadGitHubOAuthContext()?.returnTo ?? getGitHubOAuthReturnTo();
      const skipPortfolioSync = loadGitHubOAuthContext()?.skipPortfolioSync ?? false;

      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error");
        const errDesc = params.get("error_description");

        if (err) throw new Error(errDesc ?? err);
        if (!code || !state) throw new Error("Missing OAuth code or state");

        if (isGitHubSignInState(state)) {
          setStep(1);
          setMsg("Signing you in with GitHub…");
          const session = await completeGitHubPageSignIn(code, state);
          setStep(2);
          setMsg("Setting up your account…");
          const destination = await completeOAuthLearnerSignIn(session.user);
          toast({ title: "Signed in" });
          navigate(destination, { replace: true });
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("You must be signed in to connect GitHub");

        setStep(1);
        setMsg("Exchanging authorization code…");
        const result = await completeGitHubOAuth(code, state);

        let sync = result.sync;
        const userId = sessionData.session.user.id;

        if (
          !skipPortfolioSync &&
          (!sync || (sync.repos === 0 && sync.synced === 0))
        ) {
          setStep(2);
          setMsg("Syncing repositories and activity from GitHub…");
          const [skills, credentials] = await Promise.all([
            fetchDeclaredSkills(userId),
            fetchCredentials(userId),
          ]);
          const allSkills = buildSkillsForGitHubSync(
            skills.map((s) => ({ id: s.id, name: s.name })),
            credentials.map((c) => ({ skill: c.skill })),
          );
          sync = await syncGitHubPortfolio(allSkills);
        } else {
          setStep(2);
          setMsg("Finalizing connection…");
        }

        const syncNote =
          sync && !skipPortfolioSync
            ? ` — ${sync.repos} repos, ${sync.synced} activities imported.`
            : "";
        toast({
          title: "GitHub connected",
          description: `@${result.github_username} verified.${syncNote}`,
        });
        navigate(`${returnTo}?github=connected`, { replace: true });
      } catch (e) {
        const failedState = new URLSearchParams(window.location.search).get("state");
        const signInFailed = isGitHubSignInState(failedState);
        toast({
          title: signInFailed ? "GitHub sign-in failed" : "GitHub connection failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        navigate(
          signInFailed ? "/login/learner" : `${returnTo}?github=error`,
          { replace: true },
        );
      }
    })();
  }, [navigate]);

  return (
    <PublicSurfaceLayout className="grid place-items-center px-6">
      <div className="text-center text-muted-foreground">
        <DotProgress step={step} className="mb-6" />
        <div className="animate-pulse text-foreground font-medium mb-1">SIJIL</div>
        <div className="text-sm">{msg}</div>
      </div>
    </PublicSurfaceLayout>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  buildSkillsForGitHubSync,
  completeGitHubOAuth,
  syncGitHubPortfolio,
} from "@/lib/github-integration";
import { fetchDeclaredSkills } from "@/lib/db/skills";
import { fetchCredentials } from "@/lib/db/credentials";
import { supabase } from "@/integrations/supabase/client";

export default function GitHubCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Completing GitHub connection…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const err = params.get("error");
        const errDesc = params.get("error_description");

        if (err) throw new Error(errDesc ?? err);
        if (!code || !state) throw new Error("Missing OAuth code or state");

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("You must be signed in to connect GitHub");

        setMsg("Exchanging authorization code…");
        const result = await completeGitHubOAuth(code, state);

        let sync = result.sync;
        const userId = sessionData.session.user.id;

        if (!sync || (sync.repos === 0 && sync.synced === 0)) {
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
        }

        toast({
          title: "GitHub connected",
          description: `@${result.github_username} — ${sync.repos} repos, ${sync.synced} activities imported.`,
        });
        navigate("/learner/integrations", { replace: true });
      } catch (e) {
        toast({
          title: "GitHub connection failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        navigate("/learner/integrations", { replace: true });
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

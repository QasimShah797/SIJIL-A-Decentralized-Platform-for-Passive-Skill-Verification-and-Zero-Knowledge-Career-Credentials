import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
        if (err) throw new Error(err);
        if (!code || !state) throw new Error("Missing code/state");

        const { data, error } = await supabase.functions.invoke("github-oauth-callback", {
          body: {
            code,
            state,
            redirect_uri: `${window.location.origin}/auth/github/callback`,
           
toast({ title: "GitHub connected", ...});
          },
        });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

        setMsg("Connected. Syncing your activity…");
        const sync = await supabase.functions.invoke("github-sync", { body: {} });
        if (sync.error) console.warn("sync error", sync.error);

        toast({ title: "GitHub connected", description: `@${(data as { github_username?: string }).github_username ?? ""} synced.` });
        navigate("/learner/integrations", { replace: true });
      } catch (e) {
        toast({ title: "GitHub connection failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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

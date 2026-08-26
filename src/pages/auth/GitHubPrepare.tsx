import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DotProgress } from "@/components/sijil/DotProgress";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { loadGitHubOAuthContext } from "@/lib/github-env";
import { buildGitHubAuthorizeUrl } from "@/lib/github-integration";

const GITHUB_LOGOUT_MS = 2000;

/**
 * Intermediate step before GitHub OAuth on shared devices.
 * Clears any active GitHub browser session, then redirects to authorize with prompt=select_account.
 */
export default function GitHubPrepare() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Preparing GitHub connection…");
  const [step, setStep] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const ctx = loadGitHubOAuthContext();
    if (!ctx) {
      navigate("/learner/integrations", { replace: true });
      return;
    }

    const authorizeUrl = buildGitHubAuthorizeUrl(ctx);

    setStep(1);
    setMsg("Signing out any previous GitHub login on this browser…");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", "GitHub sign-out");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    iframe.src = "https://github.com/logout";
    document.body.appendChild(iframe);

    const timer = window.setTimeout(() => {
      iframe.remove();
      setStep(2);
      setMsg("Redirecting — choose YOUR GitHub account…");
      window.location.replace(authorizeUrl);
    }, GITHUB_LOGOUT_MS);

    return () => {
      window.clearTimeout(timer);
      iframe.remove();
    };
  }, [navigate]);

  return (
    <PublicSurfaceLayout className="grid place-items-center px-6">
      <div className="max-w-md text-center text-muted-foreground">
        <DotProgress step={step} className="mb-6" />
        <div className="text-foreground font-medium mb-2">Connect GitHub</div>
        <div className="text-sm">{msg}</div>
        <p className="text-xs mt-4 leading-relaxed">
          This computer may have another person&apos;s GitHub login. You will be asked to pick or sign in
          with your own GitHub account.
        </p>
      </div>
    </PublicSurfaceLayout>
  );
}

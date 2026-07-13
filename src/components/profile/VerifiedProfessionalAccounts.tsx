import { ShieldCheck } from "lucide-react";
import { VerifiedGitHubCard } from "@/components/profile/VerifiedGitHubCard";
import { VerifiedLinkedInCard } from "@/components/profile/VerifiedLinkedInCard";

type VerifiedProfessionalAccountsProps = {
  userId: string;
  returnTo?: string;
  onBeforeConnect?: () => void;
  onGitHubVerifiedChange?: (verified: boolean) => void;
  onLinkedInVerifiedChange?: (verified: boolean) => void;
};

export function VerifiedProfessionalAccounts({
  userId,
  returnTo,
  onBeforeConnect,
  onGitHubVerifiedChange,
  onLinkedInVerifiedChange,
}: VerifiedProfessionalAccountsProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Verified professional accounts
      </div>
      <p className="text-xs text-muted-foreground">
        GitHub and LinkedIn must be connected through OAuth. Manual URL entry is not permitted.
      </p>
      <div className="grid gap-4">
        <VerifiedGitHubCard
          userId={userId}
          returnTo={returnTo}
          onBeforeConnect={onBeforeConnect}
          onConnectionChange={onGitHubVerifiedChange}
        />
        <VerifiedLinkedInCard
          userId={userId}
          returnTo={returnTo}
          onBeforeConnect={onBeforeConnect}
          onConnectionChange={onLinkedInVerifiedChange}
        />
      </div>
    </section>
  );
}

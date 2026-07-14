import { Link2 } from "lucide-react";
import { VerifiedGitHubCard } from "@/components/profile/VerifiedGitHubCard";
import { LinkedInProfileUrlField } from "@/components/profile/LinkedInProfileUrlField";

type VerifiedProfessionalAccountsProps = {
  userId: string;
  returnTo?: string;
  linkedinUrl: string;
  onLinkedInUrlChange: (value: string) => void;
  onBeforeConnect?: () => void;
  onGitHubVerifiedChange?: (verified: boolean) => void;
  linkedinReadOnly?: boolean;
};

export function VerifiedProfessionalAccounts({
  userId,
  returnTo,
  linkedinUrl,
  onLinkedInUrlChange,
  onBeforeConnect,
  onGitHubVerifiedChange,
  linkedinReadOnly = false,
}: VerifiedProfessionalAccountsProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="h-4 w-4 text-primary" />
        Professional links
      </div>
      <p className="text-xs text-muted-foreground">
        Connect GitHub through OAuth. LinkedIn is an optional profile link you can add manually.
      </p>
      <div className="grid gap-4">
        <VerifiedGitHubCard
          userId={userId}
          returnTo={returnTo}
          onBeforeConnect={onBeforeConnect}
          onConnectionChange={onGitHubVerifiedChange}
        />
        <LinkedInProfileUrlField
          value={linkedinUrl}
          onChange={onLinkedInUrlChange}
          readOnly={linkedinReadOnly}
        />
      </div>
    </section>
  );
}

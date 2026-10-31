import { AppShell } from "@/components/sijil/AppShell";
import { GitHubContributionProofCard } from "@/components/recruiter/GitHubContributionProofCard";

export default function RecruiterGitHubProof() {
  return (
    <AppShell role="recruiter">
      <div className="mx-auto max-w-2xl">
        <GitHubContributionProofCard />
      </div>
    </AppShell>
  );
}

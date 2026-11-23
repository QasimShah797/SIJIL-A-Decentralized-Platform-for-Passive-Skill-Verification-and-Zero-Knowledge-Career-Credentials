import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { GitHubContributionProofCard } from "@/components/recruiter/GitHubContributionProofCard";

export default function RecruiterGitHubProof() {
  return (
    <RecruiterWorkspaceShell>
      <div className="mx-auto max-w-2xl">
        <GitHubContributionProofCard />
      </div>
    </RecruiterWorkspaceShell>
  );
}

import { Link } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { Button } from "@/components/ui/button";

/** Legacy GitHub proof request page — retired in favor of learner-shared private results. */
export default function RecruiterGitHubProof() {
  return (
    <AppShell role="recruiter">
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-6">
        <h1 className="text-xl font-semibold text-sijil-blue">GitHub proof requests retired</h1>
        <p className="text-sm text-[#475569]">
          Recruiters no longer request GitHub activity proofs. Open a candidate profile and use Private verification
          to inspect results the learner already shared.
        </p>
        <Button asChild className="bg-sijil-blue hover:bg-sijil-blue">
          <Link to="/recruiter/search">Open candidate directory</Link>
        </Button>
      </div>
    </AppShell>
  );
}

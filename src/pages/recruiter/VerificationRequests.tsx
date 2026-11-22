import { Link } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { Button } from "@/components/ui/button";

/**
 * Legacy recruiter proof-request inbox.
 * Recruiters no longer request private verification; they inspect learner-shared results.
 */
export default function RecruiterVerificationRequests() {
  return (
    <AppShell role="recruiter">
      <section className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Verification updates</h1>
          <p className="mt-1 text-sm text-[#475569]">
            Recruiters no longer request practical-score or GitHub proofs. Open a candidate profile to inspect
            credentials and private ZKP results the learner already shared.
          </p>
        </div>
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5">
          <p className="text-sm text-[#334155]">
            Use the directory to find shared candidates, then open Private verification on a profile.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="bg-[#0B1F46] hover:bg-[#16325c]">
              <Link to="/recruiter/search">Open candidate directory</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/recruiter/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

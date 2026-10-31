/**
 * Recruiter view of a learner's GitHub commit policy result.
 * The server re-verifies the Groth16 proof against the trusted snapshot before reporting it.
 * The private commit count is never part of the response.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldRow } from "@/components/sijil/FieldRow";
import { verifyGitHubPolicy, type GitHubPolicyVerifyResponse } from "@/services/api/github-zkp.api";
import { formatTimestamp, outcomeLabel } from "@/components/zkp/policy-outcome";

export function GitHubContributionProofCard() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<GitHubPolicyVerifyResponse | null>(null);

  const verify = async () => {
    setLoading(true);
    setError(null);
    setPolicy(null);
    try {
      setPolicy(await verifyGitHubPolicy(token.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const repository = policy?.scope && typeof policy.scope.repositoryFullName === "string"
    ? policy.scope.repositoryFullName
    : "—";

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-semibold">GitHub commit policy</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the learner&apos;s share code. You will see whether the unique commits they authored in one
          repository reach the SIJIL threshold. The count itself stays hidden.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-disclosure-token">Share code</Label>
        <Input id="github-disclosure-token" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
      </div>
      <Button type="button" className="rounded-xl" disabled={loading || token.trim().length < 32} onClick={() => void verify()}>
        {loading ? "Verifying…" : "Verify GitHub policy"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {policy ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Outcome: {outcomeLabel(policy.outcome)}</p>
          <FieldRow label="Policy threshold" value={`${policy.threshold} unique authored commits`} />
          <FieldRow label="Policy version" value={policy.policyVersion ?? "—"} />
          <FieldRow label="Evidence scope" value={`One repository: ${repository}`} />
          <FieldRow label="Evidence from" value={formatTimestamp(policy.evidenceFreshAt)} />
          <p className="text-xs text-muted-foreground">{policy.message}</p>
        </div>
      ) : null}
    </div>
  );
}

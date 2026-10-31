/**
 * Assessment policy result for a selective-share link.
 * The server re-verifies the stored Groth16 proof against the signed, unrevoked credential.
 * The exact score is never part of the response.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "@/components/sijil/FieldRow";
import { getSharedAssessmentPolicy, type PolicyVerifyResponse } from "@/services/api/zkp.api";
import { formatTimestamp, outcomeLabel } from "@/components/zkp/policy-outcome";

export function ReusableScoreProofCard({ shareToken }: { shareToken: string }) {
  const [policy, setPolicy] = useState<PolicyVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPolicy(null);
    setError(null);
    getSharedAssessmentPolicy(shareToken)
      .then((next) => { if (active) setPolicy(next); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load the assessment result."); });
    return () => { active = false; };
  }, [shareToken]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assessment threshold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          SIJIL proves whether the signed assessment score meets the fixed policy threshold. The exact score stays hidden.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!policy && !error ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
        {policy ? (
          <>
            <p className="text-sm font-medium">Outcome: {outcomeLabel(policy.outcome)}</p>
            <FieldRow label="Policy threshold" value={`${policy.threshold}%`} />
            <FieldRow label="Policy version" value={policy.policyVersion ?? "—"} />
            <FieldRow label="Evidence" value="Signed SIJIL assessment credential" />
            <FieldRow label="Evaluated" value={formatTimestamp(policy.evidenceFreshAt)} />
            <p className="text-xs text-muted-foreground">{policy.message}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

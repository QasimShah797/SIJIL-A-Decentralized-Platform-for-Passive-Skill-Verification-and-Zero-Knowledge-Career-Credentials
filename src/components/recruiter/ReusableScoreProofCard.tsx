/**
 * Recruiter check for a reusable score-threshold-v1 proof.
 * The learner's browser flag locallyVerified is ignored.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldRow } from "@/components/sijil/FieldRow";
import { verifyReusableScoreProof, type ReusableScoreProofResult } from "@/services/api/zkp.api";

function label(value: string | boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (!value || value === "not_checked") return "Not checked";
  return value.replaceAll("_", " ");
}

export function ReusableScoreProofCard({ shareToken }: { shareToken: string }) {
  const [proofText, setProofText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReusableScoreProofResult | null>(null);

  const verify = async () => {
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(proofText) as Record<string, unknown>;
      if (typeof parsed.circuitId !== "string" || !Array.isArray(parsed.publicSignals) || !parsed.proof) {
        throw new Error("Verification failed: The proof could not be read.");
      }
      const next = await verifyReusableScoreProof(shareToken, {
        circuitId: parsed.circuitId,
        proof: parsed.proof,
        publicSignals: parsed.publicSignals.filter((signal): signal is string => typeof signal === "string"),
      });
      setResult(next);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Verification failed: The proof could not be read.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assessment threshold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Paste the learner&apos;s reusable proof. It shows whether the signed assessment meets a public threshold.
          The exact score stays hidden. A local browser check is not used.
        </p>
        <Textarea
          aria-label="Reusable assessment proof"
          value={proofText}
          onChange={(event) => setProofText(event.target.value)}
          placeholder='{"circuitId":"score-threshold-v1","publicSignals":["60","..."],"proof":{...}}'
          className="min-h-28 font-mono text-xs"
        />
        <Button type="button" className="rounded-xl" disabled={status === "loading" || proofText.trim().length === 0} onClick={() => void verify()}>
          {status === "loading" ? "Verifying proof…" : "Verify assessment threshold"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <div className="space-y-2">
            <p className={`text-sm font-medium ${result.verified ? "text-primary" : "text-destructive"}`}>{result.message}</p>
            <FieldRow label="Issuer signature" value={label(result.checks.signature)} />
            <FieldRow label="Credential hash" value={label(result.checks.documentHash)} />
            <FieldRow label="Fabric anchor" value={label(result.checks.fabric)} />
            <FieldRow label="Groth16 proof" value={label(result.checks.proof)} />
            <FieldRow label="Threshold satisfied" value={result.verified ? `Yes, at least ${result.threshold}` : "No"} />
            <p className="text-xs text-muted-foreground">{result.replay}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

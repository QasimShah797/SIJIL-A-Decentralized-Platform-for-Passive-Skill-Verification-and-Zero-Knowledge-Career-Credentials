/**
 * Recruiter asks for a minimum score and reads the separate check results.
 * The exact score is never part of this view.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "@/components/sijil/FieldRow";
import { formatTimestamp, requestStatusLabel } from "@/components/zkp/policy-outcome";
import { createScoreRequest, getScoreRequest, type ScoreRequestDecision, type ScoreRequestSummary } from "@/services/api/zkp.api";

const PRESETS = [60, 70, 80] as const;

function checkLabel(value: string): string {
  switch (value) {
    case "valid":
    case "matches":
    case "active":
    case "accepted":
      return "Passed";
    case "unavailable":
    case "not_checked":
      return "Not checked";
    case "open":
      return "Waiting for the learner";
    case "used":
      return "Already used";
    case "expired":
      return "Expired";
    case "declined":
      return "Declined";
    default:
      return "Failed";
  }
}

export function AssessmentProofRequestCard({ shareToken, presentationId }: { shareToken?: string; presentationId?: string }) {
  const [threshold, setThreshold] = useState<number>(70);
  const [request, setRequest] = useState<ScoreRequestSummary | null>(null);
  const [decision, setDecision] = useState<ScoreRequestDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const storageKey = `sijil-score-request:${presentationId ?? shareToken ?? "missing"}`;

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    let active = true;
    void getScoreRequest(saved)
      .then((next) => {
        if (!active) return;
        setRequest(next.request);
        setDecision(next.decision);
      })
      .catch(() => {
        sessionStorage.removeItem(storageKey);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const create = async () => {
    setWorking(true);
    setError(null);
    setDecision(null);
    try {
      const created = presentationId
        ? await createScoreRequest({ presentationId, threshold })
        : await createScoreRequest(shareToken ?? "", threshold);
      sessionStorage.setItem(storageKey, created.id);
      setRequest(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The request could not be created.";
      const cleaned = message.replace(/^API \d+:\s*/, "");
      setError(/not available|503/i.test(message)
        ? "Score requests are unavailable until the verification table is applied. This is not a verified proof."
        : /401|403|recruiter/i.test(message)
          ? "Sign in as a recruiter to request a minimum score."
          : cleaned);
    } finally {
      setWorking(false);
    }
  };

  const refresh = async () => {
    if (!request) return;
    setWorking(true);
    setError(null);
    try {
      const next = await getScoreRequest(request.id);
      setRequest(next.request);
      setDecision(next.decision);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The result could not be loaded.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Minimum score request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ask the learner to prove a minimum score. You will not see the exact score or the secret that hides it.
          A mathematical pass, a valid credential, and an overall acceptance are shown separately.
          This is not a one-time cryptographic challenge, and a green result is not shown before the checks succeed.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Requested minimum">
          {PRESETS.map((value) => (
            <Button key={value} type="button" size="sm" variant={threshold === value ? "default" : "outline"} onClick={() => setThreshold(value)}>
              {value}%
            </Button>
          ))}
        </div>
        <Button type="button" disabled={working || request?.status === "open"} onClick={() => void create()}>
          {working ? "Working…" : `Request ${threshold}% proof`}
        </Button>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {request ? (
          <div className="space-y-2">
            <FieldRow label="Request" value={requestStatusLabel(request.status)} />
            <FieldRow label="Minimum" value={`${request.threshold}%`} />
            <FieldRow label="Expires" value={formatTimestamp(request.expiresAt)} />
            <Button type="button" variant="outline" disabled={working} onClick={() => void refresh()}>Check result</Button>
          </div>
        ) : null}
        {decision ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{decision.accepted ? "Policy accepted for this request" : "Not accepted"}</p>
            <FieldRow label="Mathematics" value={checkLabel(decision.checks.mathematics)} />
            <FieldRow label="Credential signature" value={checkLabel(decision.checks.signature)} />
            <FieldRow label="Document" value={checkLabel(decision.checks.document)} />
            <FieldRow label="Same credential" value={checkLabel(decision.checks.commitment)} />
            <FieldRow label="Requested minimum" value={checkLabel(decision.checks.threshold)} />
            <FieldRow label="Holder" value={checkLabel(decision.checks.holder)} />
            <FieldRow label="Revocation" value={checkLabel(decision.checks.revocation)} />
            <FieldRow label="Blockchain" value={checkLabel(decision.checks.ledger)} />
            <p className="text-xs text-muted-foreground">{decision.message}</p>
            <p className="text-xs text-muted-foreground">{decision.limitation}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

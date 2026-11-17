import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "@/components/sijil/FieldRow";
import { formatTimestamp } from "@/components/zkp/policy-outcome";
import { createGithubActivityRequest, listVerificationRequests, type VerificationRequestView } from "@/services/api/zkp.api";

const THRESHOLDS = [50, 100, 150] as const;
const OPEN = new Set(["pending", "approved", "generating"]);

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting for the learner";
    case "approved":
      return "Approved";
    case "generating":
      return "Proof in progress";
    case "verified":
      return "Verified";
    case "unsatisfied":
      return "Not satisfied";
    case "failed":
      return "Failed";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function resultText(status: string): string | null {
  switch (status) {
    case "verified":
      return "The proof was verified. The exact commit count was not revealed.";
    case "unsatisfied":
      return "The connected GitHub account does not meet this threshold. The exact count was not revealed.";
    case "failed":
      return "The proof could not be completed. This is not a result about the commit count.";
    case "rejected":
      return "The learner rejected this request.";
    case "expired":
      return "This request expired before it was completed.";
    case "approved":
    case "generating":
      return "The learner approved the request. The result is not ready yet.";
    default:
      return null;
  }
}

export function GitHubActivityRequestCard({ learnerUserId }: { learnerUserId: string }) {
  const [threshold, setThreshold] = useState<(typeof THRESHOLDS)[number]>(100);
  const [request, setRequest] = useState<VerificationRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const storageKey = `sijil-github-request:${learnerUserId}`;

  const choose = (rows: VerificationRequestView[], preferredId?: string | null) => {
    const mine = rows.filter((row) => row.category === "github-activity" && row.learnerUserId === learnerUserId);
    return mine.find((row) => row.id === preferredId)
      ?? mine.find((row) => OPEN.has(row.status) && row.threshold === threshold)
      ?? mine.find((row) => OPEN.has(row.status))
      ?? mine[0]
      ?? null;
  };

  const load = async (preferredId?: string | null) => {
    const result = await listVerificationRequests("recruiter");
    if (result.available === false) {
      throw new Error("Verification requests are not available until the notification table is applied.");
    }
    const next = choose(result.requests, preferredId ?? sessionStorage.getItem(storageKey));
    setRequest(next);
    if (next) sessionStorage.setItem(storageKey, next.id);
    return next;
  };

  useEffect(() => {
    let active = true;
    void load().catch((err: unknown) => {
      if (!active) return;
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The request could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [learnerUserId]);

  const send = async () => {
    setWorking(true);
    setError(null);
    try {
      const created = await createGithubActivityRequest(learnerUserId, threshold);
      sessionStorage.setItem(storageKey, created.id);
      await load(created.id);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The request could not be created.";
      setError(message);
    } finally {
      setWorking(false);
    }
  };

  const refresh = async () => {
    if (!request) return;
    setWorking(true);
    setError(null);
    try {
      await load(request.id);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The result could not be loaded.");
    } finally {
      setWorking(false);
    }
  };

  const blocked = Boolean(request && OPEN.has(request.status) && request.threshold === threshold);
  const outcome = request ? resultText(request.status) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">GitHub activity request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ask whether this learner's connected GitHub account authored at least the selected number of unique commits. The learner chooses the repository. The exact count stays hidden.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Commit threshold">
          {THRESHOLDS.map((value) => (
            <Button key={value} type="button" size="sm" variant={threshold === value ? "default" : "outline"} onClick={() => setThreshold(value)}>
              {value}
            </Button>
          ))}
        </div>
        <Button type="button" disabled={working || blocked} onClick={() => void send()}>
          {working ? "Working…" : `Request ${threshold} commit proof`}
        </Button>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {request ? (
          <div className="space-y-2">
            <FieldRow label="Request" value={statusLabel(request.status)} />
            <FieldRow label="Threshold" value={`${request.threshold ?? threshold} unique commits`} />
            <FieldRow label="Expires" value={formatTimestamp(request.expiresAt)} />
            <Button type="button" variant="outline" disabled={working} onClick={() => void refresh()}>Check result</Button>
          </div>
        ) : null}
        {outcome ? <p className="text-xs text-muted-foreground">{outcome}</p> : null}
      </CardContent>
    </Card>
  );
}

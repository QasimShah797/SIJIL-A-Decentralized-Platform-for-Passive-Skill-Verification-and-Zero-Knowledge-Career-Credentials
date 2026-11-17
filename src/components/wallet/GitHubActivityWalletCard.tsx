import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/components/zkp/policy-outcome";
import {
  approveVerificationRequest,
  listVerificationRequests,
  proveGithubActivityRequest,
  rejectVerificationRequest,
  type VerificationRequestView,
} from "@/services/api/zkp.api";

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting for your decision";
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

export function GitHubActivityWalletCard({ focusRequestId }: { focusRequestId?: string | null }) {
  const [requests, setRequests] = useState<VerificationRequestView[]>([]);
  const [repository, setRepository] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = async () => {
    const result = await listVerificationRequests("learner").catch(() => null);
    setRequests((result?.requests ?? []).filter((row) => row.category === "github-activity"));
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!focusRequestId) return;
    const node = document.getElementById(`github-activity-request-${focusRequestId}`);
    if (typeof node?.scrollIntoView === "function") node.scrollIntoView({ block: "center" });
  }, [focusRequestId, requests]);

  const act = async (id: string, kind: "approve" | "reject") => {
    setError(null);
    setMessage(null);
    setWorkingId(id);
    try {
      if (kind === "approve") await approveVerificationRequest(id);
      else await rejectVerificationRequest(id);
      setMessage(kind === "approve" ? "Request approved. Choose one repository, then generate the proof." : "Request rejected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The request could not be updated.");
    } finally {
      setWorkingId(null);
    }
  };

  const prove = async (id: string) => {
    setError(null);
    setMessage("Generating the proof…");
    setWorkingId(id);
    try {
      const result = await proveGithubActivityRequest(id, repository.trim());
      setMessage(result.status === "unsatisfied"
        ? "The connected account does not meet this threshold. The exact count was not revealed."
        : result.status === "verified"
          ? "The proof was verified. The exact count was not revealed."
          : "The proof could not be completed. This is not a result about the commit count.");
      await load();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The proof could not be completed.");
    } finally {
      setWorkingId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <section className="learner-stat-card space-y-3 p-4" aria-labelledby="github-activity-heading">
      <h2 id="github-activity-heading" className="text-sm font-semibold text-[#023E8A]">GitHub activity requests</h2>
      <p className="text-xs text-[#64748b]">Only commits authored by your connected GitHub account are counted. Choose one repository you can access. The recruiter does not see the exact count.</p>
      {requests.map((request) => (
        <article
          key={request.id}
          id={`github-activity-request-${request.id}`}
          className={`rounded-lg border p-3 text-xs text-[#334155] ${request.id === focusRequestId ? "border-[#023E8A] bg-[#e8eef7]" : "border-[#c7d7f5] bg-[#f8fbff]"}`}
        >
          <p className="font-medium">GitHub activity · at least {request.threshold ?? "the requested"} unique commits</p>
          <p className="mt-1">From {request.recruiterLabel}. Status: {statusLabel(request.status)}.</p>
          <p className="mt-1">Expires {formatTimestamp(request.expiresAt)}.</p>
          {request.status === "pending" ? (
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" disabled={workingId === request.id} onClick={() => void act(request.id, "approve")}>Approve request</Button>
              <Button type="button" size="sm" variant="outline" disabled={workingId === request.id} onClick={() => void act(request.id, "reject")}>Reject request</Button>
            </div>
          ) : null}
          {request.status === "approved" || request.status === "generating" ? (
            <div className="mt-2 space-y-2">
              <label className="block" htmlFor={`repo-${request.id}`}>Repository, owner/name</label>
              <input id={`repo-${request.id}`} value={repository} onChange={(event) => setRepository(event.target.value)} className="w-full rounded-md border px-2 py-1" placeholder="octocat/hello" />
              <Button type="button" size="sm" disabled={workingId === request.id} onClick={() => void prove(request.id)}>
                {workingId === request.id ? "Working…" : "Generate proof"}
              </Button>
            </div>
          ) : null}
        </article>
      ))}
      {message ? <p className="text-xs text-[#334155]">{message}</p> : null}
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </section>
  );
}

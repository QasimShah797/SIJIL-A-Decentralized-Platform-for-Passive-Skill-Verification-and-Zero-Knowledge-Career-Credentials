/**
 * Read-only GitHub commit policy outcomes, produced automatically for repositories linked to
 * declared competencies. Learners can only connect or reconnect GitHub here.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { startGitHubOAuth } from "@/lib/github-integration";
import {
  getZkpStatus,
  listGitHubEvidence,
  type GitHubEvidenceResponse,
  type ZkpPolicyStatusItem,
} from "@/services/api/github-zkp.api";
import { formatTimestamp, needsGitHubReconnect, outcomeLabel } from "@/components/zkp/policy-outcome";

function repositoryOf(row: ZkpPolicyStatusItem): string {
  const scope = row.evidenceScope as { repositoryFullName?: unknown };
  return typeof scope.repositoryFullName === "string" ? scope.repositoryFullName : row.evidenceRef.replace(/^repo:/, "");
}

export function GitHubPolicyStatusCard({ competencyId }: { competencyId: string }) {
  const [evidence, setEvidence] = useState<GitHubEvidenceResponse["github"] | null>(null);
  const [statuses, setStatuses] = useState<ZkpPolicyStatusItem[]>([]);
  const [threshold, setThreshold] = useState(70);

  useEffect(() => {
    setStatuses([]);
    let active = true;
    Promise.all([listGitHubEvidence(), getZkpStatus(competencyId)])
      .then(([eligible, policy]) => {
        if (!active) return;
        setEvidence(eligible.github);
        setStatuses(policy.github);
        setThreshold(policy.policy.githubThreshold);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [competencyId]);

  const connected = evidence?.connected === true;
  const authNeeded = Boolean(evidence) && (!connected || statuses.some((row) => needsGitHubReconnect(row.errorCode)));

  const connect = async () => {
    window.location.href = await startGitHubOAuth({ returnTo: "/learner/wallet", skipPortfolioSync: true });
  };

  return (
    <div className="learner-stat-card space-y-3 p-4">
      <div>
        <p className="text-sm font-semibold text-[#023E8A]">GitHub commit policy</p>
        <p className="mt-1 text-xs text-[#64748b]">
          SIJIL automatically checks repositories linked to this competency against the fixed policy of {threshold} unique
          authored commits and proves the result without revealing the count.
        </p>
      </div>
      {authNeeded ? (
        <Button type="button" className="rounded-xl" onClick={() => void connect()}>
          {connected ? "Reconnect GitHub" : "Connect GitHub"}
        </Button>
      ) : null}
      {statuses.length > 0 ? (
        <ul className="space-y-2 text-xs text-[#334155]">
          {statuses.map((row) => (
            <li key={row.evidenceRef} className="rounded-lg border p-2">
              <p className="font-medium text-[#023E8A]">{repositoryOf(row)}</p>
              <p role="status">Status: {outcomeLabel(row.outcome)} · threshold {row.threshold}</p>
              <p className="text-[#64748b]">Evidence from: {formatTimestamp(row.evidenceFreshAt)}</p>
              {needsGitHubReconnect(row.errorCode) ? (
                <p className="text-red-700">GitHub authorization is needed before this can refresh.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#64748b]">No GitHub evidence linked to this competency yet.</p>
      )}
    </div>
  );
}

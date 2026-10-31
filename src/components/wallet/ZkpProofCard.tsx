/**
 * Learner wallet status for the automated assessment policy proof.
 * SIJIL evaluates every signed assessment credential at the fixed 60% policy on the server.
 * The credential stays in the wallet whatever the outcome.
 */
import { useCallback, useEffect, useState } from "react";
import { getZkpStatus, type ZkpPolicyStatusItem } from "@/services/api/zkp.api";
import { formatTimestamp, outcomeLabel } from "@/components/zkp/policy-outcome";

export function ZkpProofCard({
  commitment,
  competencyId,
}: {
  credentialId: string;
  commitment: string;
  competencyId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<ZkpPolicyStatusItem | null>(null);
  const [policyThreshold, setPolicyThreshold] = useState(60);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await getZkpStatus(competencyId);
      setPolicyThreshold(next.policy.assessmentThreshold);
      setItem(next.assessment.find((row) => row.commitment === commitment) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the proof status.");
    } finally {
      setLoaded(true);
    }
  }, [commitment, competencyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Assessment proof</p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        SIJIL checks your score against the {policyThreshold}% policy automatically and proves the result
        without revealing the score. This credential stays in your wallet either way.
      </p>
      <p className="mt-3 text-xs text-[#334155]" role="status">
        Status: {loaded ? (item ? outcomeLabel(item.outcome) : "Pending") : "Loading…"}
      </p>
      {item ? (
        <p className="mt-1 text-xs text-[#64748b]">Last updated: {formatTimestamp(item.updatedAt)}</p>
      ) : null}
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

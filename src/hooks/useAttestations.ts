import { useCallback, useEffect, useState } from "react";
import type { AttestationRecord } from "@/lib/sijil-data";

/**
 * @deprecated Institution UI should use `useInstitutionAttestationRequests()` instead.
 * Legacy hook kept to avoid importing the removed `attestations` table.
 */
export function useAttestations() {
  const [attestations] = useState<AttestationRecord[]>([]);
  const [loading] = useState(false);

  const refresh = useCallback(async () => {
    return;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateAttestation = async (_id: string, _patch: Partial<AttestationRecord>) => {
    throw new Error("Legacy attestations flow is disabled. Use institution attestation requests.");
  };

  return { attestations, loading, refresh, updateAttestation };
}

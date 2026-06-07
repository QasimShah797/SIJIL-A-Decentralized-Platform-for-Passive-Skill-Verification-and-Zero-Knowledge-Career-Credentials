import { useCallback, useEffect, useState } from "react";
import { fetchAttestations, updateAttestationDb } from "@/lib/db/attestations";
import type { AttestationRecord } from "@/lib/sijil-data";

export function useAttestations() {
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAttestations(await fetchAttestations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateAttestation = async (id: string, patch: Partial<AttestationRecord>) => {
    await updateAttestationDb(id, patch);
    setAttestations((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  return { attestations, loading, refresh, updateAttestation };
}

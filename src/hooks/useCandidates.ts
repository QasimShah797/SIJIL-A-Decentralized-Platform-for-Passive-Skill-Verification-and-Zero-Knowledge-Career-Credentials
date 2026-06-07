import { useCallback, useEffect, useState } from "react";
import { fetchCandidates, fetchCandidateSkillsMap, type CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";

export function useCandidates() {
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [candidateSkills, setCandidateSkills] = useState<Record<string, CandidateSkill[]>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cs] = await Promise.all([fetchCandidates(), fetchCandidateSkillsMap()]);
      setCandidates(c);
      setCandidateSkills(cs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { candidates, candidateSkills, loading, refresh };
}

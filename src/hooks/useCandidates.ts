import { useCallback, useEffect, useState } from "react";
import { applyCandidateCardFields, fetchCandidateCardFieldsByIds, type CandidateView } from "@/lib/db/candidates";
import { apiRequest, isApiEnabled } from "@/services/api/client";
import { getCandidateProfileFieldsApi } from "@/services/api/recruiter.api";
import type { CandidateSkill } from "@/lib/sijil-data";
import { formatSupabaseError } from "@/lib/utils";

const API_DOWN_MESSAGE =
  "The SIJIL API is not running on http://localhost:5000, and no learners were loaded from Supabase. Start the backend with `cd backend && npm run dev`, then refresh.";

export function useCandidates() {
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [candidateSkills, setCandidateSkills] = useState<Record<string, CandidateSkill[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      let viaApi: CandidateView[] | null = null;
      let apiDown = false;
      if (isApiEnabled()) {
        try {
          viaApi = await apiRequest<CandidateView[]>("/recruiter/search");
        } catch {
          apiDown = true;
        }
      }

      if (viaApi === null) {
        setCandidates([]);
        setCandidateSkills({});
        setError(apiDown || !isApiEnabled() ? API_DOWN_MESSAGE : null);
        return;
      }

      const cs: Record<string, CandidateSkill[]> = {};
      let c: CandidateView[] = viaApi;

      if (c.length === 0 && apiDown) {
        setCandidates([]);
        setCandidateSkills({});
        setError(API_DOWN_MESSAGE);
        return;
      }

      const cardFields = new Map<string, Pick<CandidateView, "avatarUrl" | "skillsSummary" | "careerGoal">>();
      const ids = c.map((candidate) => candidate.id);

      if (isApiEnabled()) {
        try {
          const fromApi = await getCandidateProfileFieldsApi(ids);
          if (fromApi) {
            for (const [id, fields] of Object.entries(fromApi)) {
              cardFields.set(id, fields);
            }
          }
        } catch {
          // fall through to Supabase enrichment
        }
      }

      if (cardFields.size === 0) {
        const fromSupabase = await fetchCandidateCardFieldsByIds(ids);
        for (const [id, fields] of fromSupabase.entries()) {
          cardFields.set(id, fields);
        }
      }

      c = applyCandidateCardFields(c, cardFields)
        .filter((candidate) => (candidate.credentialCount ?? 0) > 0);

      setCandidates(c);
      setCandidateSkills(cs);
    } catch (err) {
      setCandidates([]);
      setCandidateSkills({});
      setError(
        isApiEnabled()
          ? `${API_DOWN_MESSAGE} ${formatSupabaseError(err)}`
          : formatSupabaseError(err),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh({ silent: true }); }, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { candidates, candidateSkills, loading, error, refresh };
}

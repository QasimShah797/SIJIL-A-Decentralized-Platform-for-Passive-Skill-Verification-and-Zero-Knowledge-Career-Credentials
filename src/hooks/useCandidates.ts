import { useCallback, useEffect, useState } from "react";
import { fetchCandidates, fetchCandidateSkillsMap, mergeCandidateLists, applyCandidateCardFields, fetchCandidateCardFieldsByIds, coalesceCandidateText, type CandidateView } from "@/lib/db/candidates";
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

  const refresh = useCallback(async () => {
    setLoading(true);
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

      const [fallbackCandidates, cs] = await Promise.all([
        fetchCandidates(),
        fetchCandidateSkillsMap().catch(() => ({})),
      ]);

      let c: CandidateView[];
      if (viaApi === null) {
        c = fallbackCandidates;
      } else if (viaApi.length === 0) {
        c = fallbackCandidates;
      } else {
        c = mergeCandidateLists(viaApi, fallbackCandidates);
      }

      const fallbackById = new Map(fallbackCandidates.map((candidate) => [candidate.id, candidate]));
      c = c.map((candidate) => {
        const fallback = fallbackById.get(candidate.id);
        if (!fallback) return candidate;
        return {
          ...candidate,
          avatarUrl: coalesceCandidateText(candidate.avatarUrl, fallback.avatarUrl),
          skillsSummary: coalesceCandidateText(candidate.skillsSummary, fallback.skillsSummary),
          careerGoal: coalesceCandidateText(candidate.careerGoal, fallback.careerGoal),
          searchableSkills: [...new Set([...(candidate.searchableSkills ?? []), ...(fallback.searchableSkills ?? [])])],
        };
      });

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

      const fromSupabase = await fetchCandidateCardFieldsByIds(ids);
      for (const [id, fields] of fromSupabase.entries()) {
        const existing = cardFields.get(id);
        cardFields.set(id, {
          avatarUrl: coalesceCandidateText(existing?.avatarUrl, fields.avatarUrl),
          skillsSummary: coalesceCandidateText(existing?.skillsSummary, fields.skillsSummary),
          careerGoal: coalesceCandidateText(existing?.careerGoal, fields.careerGoal),
        });
      }

      c = applyCandidateCardFields(c, cardFields);

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

  useEffect(() => { refresh(); }, [refresh]);

  return { candidates, candidateSkills, loading, error, refresh };
}

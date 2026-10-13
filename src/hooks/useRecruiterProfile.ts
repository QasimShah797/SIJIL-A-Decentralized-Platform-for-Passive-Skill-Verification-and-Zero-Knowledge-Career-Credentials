import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchRecruiterProfileView,
  type RecruiterProfileView,
} from "@/lib/db/recruiter-profile";
import { formatSupabaseError } from "@/lib/utils";

export const RECRUITER_PROFILE_UPDATED = "sijil-recruiter-profile-updated";

export function useRecruiterProfile(enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<RecruiterProfileView | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setProfile(await fetchRecruiterProfileView(userId));
    } catch (err) {
      setProfile(null);
      setError(formatSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onUpdate = () => {
      void refresh();
    };
    window.addEventListener(RECRUITER_PROFILE_UPDATED, onUpdate);
    return () => window.removeEventListener(RECRUITER_PROFILE_UPDATED, onUpdate);
  }, [enabled, refresh]);

  return { profile, loading, error, refresh };
}

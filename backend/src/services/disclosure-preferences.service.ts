/**
 * Learner exact-value disclosure permissions (exact assessment marks, exact GitHub commit counts).
 * Permissions only gate what recruiters receive; they never affect proof generation or outcomes.
 * Defaults are OFF; a missing table also reads as OFF.
 */
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isMissingRelationError } from "../utils/supabase-errors";

export interface DisclosurePreferences {
  shareExactAssessmentMarks: boolean;
  shareExactGithubCommitCount: boolean;
  updatedAt: string | null;
}

export type DisclosurePreferencesPatch = Partial<
  Pick<DisclosurePreferences, "shareExactAssessmentMarks" | "shareExactGithubCommitCount">
>;

export const DEFAULT_DISCLOSURE_PREFERENCES: DisclosurePreferences = Object.freeze({
  shareExactAssessmentMarks: false,
  shareExactGithubCommitCount: false,
  updatedAt: null,
});

export interface DisclosurePreferencesStore {
  get(learnerId: string): Promise<DisclosurePreferences>;
  set(learnerId: string, patch: DisclosurePreferencesPatch): Promise<DisclosurePreferences>;
}

const TABLE = "learner_disclosure_preferences";

function unavailable(error: unknown): boolean {
  return isMissingRelationError(error) || isMissingColumnError(error);
}

function fromRow(row: Record<string, unknown> | null | undefined): DisclosurePreferences {
  if (!row) return { ...DEFAULT_DISCLOSURE_PREFERENCES };
  return {
    shareExactAssessmentMarks: row.share_exact_assessment_marks === true,
    shareExactGithubCommitCount: row.share_exact_github_commit_count === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export function createSupabaseDisclosurePreferencesStore(): DisclosurePreferencesStore {
  return {
    async get(learnerId) {
      // Fail closed: any read failure means exact values stay hidden.
      try {
        const { data, error } = await getServiceSupabase()
          .from(TABLE)
          .select("share_exact_assessment_marks, share_exact_github_commit_count, updated_at")
          .eq("learner_user_id", learnerId)
          .maybeSingle();
        if (error) return { ...DEFAULT_DISCLOSURE_PREFERENCES };
        return fromRow(data as Record<string, unknown> | null);
      } catch {
        return { ...DEFAULT_DISCLOSURE_PREFERENCES };
      }
    },

    async set(learnerId, patch) {
      const current = await this.get(learnerId);
      const next = {
        learner_user_id: learnerId,
        share_exact_assessment_marks: patch.shareExactAssessmentMarks ?? current.shareExactAssessmentMarks,
        share_exact_github_commit_count: patch.shareExactGithubCommitCount ?? current.shareExactGithubCommitCount,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await getServiceSupabase()
        .from(TABLE)
        .upsert(next, { onConflict: "learner_user_id" })
        .select("share_exact_assessment_marks, share_exact_github_commit_count, updated_at")
        .maybeSingle();
      if (error) {
        if (unavailable(error)) throw new AppError("Disclosure settings are not available yet", 503);
        throw new AppError("Could not save disclosure settings", 503);
      }
      return fromRow(data as Record<string, unknown> | null);
    },
  };
}

let activeStore: DisclosurePreferencesStore | undefined;

export function disclosurePreferencesStore(): DisclosurePreferencesStore {
  activeStore ??= createSupabaseDisclosurePreferencesStore();
  return activeStore;
}

export function setDisclosurePreferencesStoreForTests(store: DisclosurePreferencesStore | undefined): void {
  activeStore = store;
}

import { supabase } from "@/integrations/supabase/client";
import { getCandidateApi } from "@/services/api/recruiter.api";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { resolveLearnerDisplayName } from "@/lib/learner-display-name";
import {
  buildCandidateDetail,
  extractDisclosedLearnerName,
  mapCredentialShareToView,
  mapWalletShareToView,
  pickRecruiterDisplayName,
  type CandidateDetailView,
  type SharedCredentialView,
} from "@/lib/shared-presentation";

function asUntypedClient() {
  return supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => any;
      };
    };
  };
}

async function fetchWalletShares(candidateId: string): Promise<SharedCredentialView[]> {
  try {
    const { data, error } = await asUntypedClient()
      .from("selective_disclosure_presentations")
      .select("id, selected_fields, selection_mode, disclosed_payload, proof_type, expires_at, revoked_at, created_at")
      .eq("learner_id", candidateId);

    if (error) {
      if (isMissingRelationError(error)) return [];
      throw error;
    }

    return (data ?? [])
      .map((row: Record<string, unknown>) => mapWalletShareToView(row))
      .filter((item): item is SharedCredentialView => item !== null);
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

async function fetchCredentialShares(candidateId: string): Promise<SharedCredentialView[]> {
  const { data, error } = await supabase
    .from("presentations")
    .select("token, candidate_user_id, disclosed_fields, hidden_fields, expires_at, revoked, created_at, proof")
    .eq("candidate_user_id", candidateId)
    .eq("revoked", false);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }

  return (data ?? [])
    .map((row) => mapCredentialShareToView(row))
    .filter((item): item is SharedCredentialView => item !== null);
}

export async function fetchActiveSharedCredentials(candidateId: string): Promise<SharedCredentialView[]> {
  const [walletShares, credentialShares] = await Promise.all([
    fetchWalletShares(candidateId),
    fetchCredentialShares(candidateId),
  ]);

  return [...walletShares, ...credentialShares].sort((a, b) => (
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ));
}

async function fetchCandidateProfile(candidateId: string): Promise<{ name: string; institution: string } | null> {
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("user_id, first_name, last_name, username, university_email, institution_name")
    .eq("user_id", candidateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    name: resolveLearnerDisplayName(data),
    institution: data.institution_name ?? "—",
  };
}

async function fetchReviewCount(candidateId: string): Promise<number> {
  const { count, error } = await supabase
    .from("peer_reviews")
    .select("*", { count: "exact", head: true })
    .eq("learner_user_id", candidateId);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Recruiter candidate detail: backend first, then Supabase fallback.
 * Never reads the learner wallet or unfiltered credentials table.
 */
export async function fetchCandidateDetail(candidateId: string): Promise<CandidateDetailView | null> {
  const [viaApi, profile] = await Promise.all([
    getCandidateApi(candidateId),
    fetchCandidateProfile(candidateId).catch(() => null),
  ]);

  const resolvedName = pickRecruiterDisplayName(
    extractDisclosedLearnerName(viaApi?.sharedCredentials ?? []),
    viaApi?.name,
    profile?.name,
  );
  const resolvedInstitution = profile?.institution ?? viaApi?.institution ?? "—";

  if (viaApi && Array.isArray(viaApi.sharedCredentials)) {
    return buildCandidateDetail({
      id: viaApi.id,
      name: resolvedName,
      institution: resolvedInstitution,
      reviews: viaApi.reviews,
      sharedCredentials: viaApi.sharedCredentials,
    });
  }

  const [sharedCredentials, reviews] = await Promise.all([
    fetchActiveSharedCredentials(candidateId),
    viaApi ? Promise.resolve(viaApi.reviews) : fetchReviewCount(candidateId),
  ]);

  if (!sharedCredentials.length && !profile && !viaApi) return null;

  return buildCandidateDetail({
    id: candidateId,
    name: resolvedName,
    institution: resolvedInstitution,
    reviews,
    sharedCredentials,
  });
}

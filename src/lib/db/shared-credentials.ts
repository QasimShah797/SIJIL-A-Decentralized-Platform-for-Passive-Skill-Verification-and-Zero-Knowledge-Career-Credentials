import { getCandidateApi } from "@/services/api/recruiter.api";
import {
  buildCandidateDetail,
  extractDisclosedLearnerName,
  pickRecruiterDisplayName,
  type CandidateDetailView,
  type SharedCredentialView,
} from "@/lib/shared-presentation";

/** Private share rows are not read from the browser. The API returns directory shares only. */
export async function fetchActiveSharedCredentials(_candidateId: string): Promise<SharedCredentialView[]> {
  return [];
}

/**
 * Recruiter candidate detail comes from the API.
 * The browser does not select another learner's share or credential rows.
 */
export async function fetchCandidateDetail(candidateId: string): Promise<CandidateDetailView | null> {
  const viaApi = await getCandidateApi(candidateId);
  if (!viaApi || !Array.isArray(viaApi.sharedCredentials) || viaApi.sharedCredentials.length === 0) {
    return null;
  }

  return buildCandidateDetail({
    id: viaApi.id || candidateId,
    name: pickRecruiterDisplayName(
      extractDisclosedLearnerName(viaApi.sharedCredentials),
      viaApi.name,
    ),
    institution: viaApi.institution ?? "—",
    reviews: viaApi.reviews,
    sharedCredentials: viaApi.sharedCredentials,
  });
}

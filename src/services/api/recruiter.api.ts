/**
 * Recruiter API — backend layer for credential verification and candidate search.
 */
import { tryApiRequest } from "./client";
import type { CredentialView } from "@/lib/db/credentials";
import type { CandidateView } from "@/lib/db/candidates";

export interface VerifyCredentialResult {
  credential: Partial<CredentialView>;
  disclosedFields: { id: string; label: string; value: string }[];
  presentationStatus: "Active" | "Expired" | "Revoked";
  candidateId?: string;
}

export async function verifyCredentialApi(
  credentialId: string,
): Promise<VerifyCredentialResult | null> {
  return tryApiRequest<VerifyCredentialResult>(
    `/recruiter/verify/${encodeURIComponent(credentialId)}`,
  );
}

export async function getCandidateApi(candidateId: string): Promise<CandidateView | null> {
  return tryApiRequest<CandidateView>(`/recruiter/candidate/${candidateId}`);
}

export async function searchCandidatesApi(query?: {
  q?: string;
  skill?: string;
  institution?: string;
}): Promise<CandidateView[] | null> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.skill) params.set("skill", query.skill);
  if (query?.institution) params.set("institution", query.institution);
  const qs = params.toString();
  return tryApiRequest<CandidateView[]>(`/recruiter/search${qs ? `?${qs}` : ""}`);
}

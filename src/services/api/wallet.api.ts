import { apiRequest, isApiEnabled, tryApiRequest } from "./client";
import type { WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import type {
  WalletShareFieldId,
  WalletShareSelectionMode,
} from "@/lib/wallet-competency-shared";

export interface WalletShareRecordView {
  id: string;
  competencyId: string;
  selectedFields: WalletShareFieldId[];
  selectionMode: WalletShareSelectionMode;
  proofType: string;
  shareStatus: "Active" | "Expired" | "Revoked";
  tokenHint: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  recipientName?: string | null;
  recipientOrganization?: string | null;
}

export interface WalletCompetencyDetailView {
  record: WalletCompetencyRecordView;
  shares: WalletShareRecordView[];
}

export interface ShareWalletCompetencyResult {
  shareId: string;
  shareUrl: string;
  token: string;
  tokenHint: string;
  proofType: string;
  expiresAt: string | null;
  delivery?: "public-link" | "direct-recruiter" | "all-recruiters";
  recipientName?: string | null;
  recipientOrganization?: string | null;
}

export interface RegisteredRecruiter {
  id: string;
  name: string;
  organization: string;
  title: string;
}

export interface PublicPresentationVerification {
  tokenValid: boolean;
  expired: boolean;
  revoked: boolean;
  payloadHashMatches: boolean;
  proofValid: boolean;
  recordUnmodified: boolean;
  result: "Valid Proof" | "Expired" | "Revoked" | "Invalid/Tampered";
}

export interface PublicPresentationView {
  id: string;
  competencyId: string;
  selectedFields: WalletShareFieldId[];
  selectionMode: WalletShareSelectionMode;
  disclosedPayload: Record<string, unknown>;
  proofType: string;
  verificationMethod: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  payloadHash: string;
  proofValue: string | null;
  verification: PublicPresentationVerification;
}

export async function getWalletCompetenciesApi(): Promise<WalletCompetencyRecordView[] | null> {
  return tryApiRequest<WalletCompetencyRecordView[]>("/wallet/competencies");
}

export async function getWalletCompetencyApi(
  competencyId: string,
): Promise<WalletCompetencyDetailView | null> {
  return tryApiRequest<WalletCompetencyDetailView>(
    `/wallet/competencies/${encodeURIComponent(competencyId)}`,
  );
}

export async function syncWalletCompetencyApi(
  competencyId: string,
): Promise<WalletCompetencyRecordView | null> {
  return tryApiRequest<WalletCompetencyRecordView>(
    `/wallet/competencies/${encodeURIComponent(competencyId)}/sync`,
    { method: "POST" },
  );
}

export async function listRegisteredRecruitersApi(query: string): Promise<RegisteredRecruiter[]> {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiRequest<RegisteredRecruiter[]>(`/wallet/recruiters${params}`);
}

export type EvidenceShareMode = "details" | "private" | "omit";

export type ShareEvidenceModes = {
  practical_task_result: EvidenceShareMode;
  github_evidence: EvidenceShareMode;
  lms_evidence: EvidenceShareMode;
  peer_reviews: EvidenceShareMode;
};

export async function shareWalletCompetencyApi(input: {
  competencyId: string;
  selectionMode: WalletShareSelectionMode;
  selectedFields: WalletShareFieldId[];
  evidenceModes?: ShareEvidenceModes;
  shareScope?: "all" | "selected" | "issued";
  expiresInDays?: number;
  recipientUserId?: string;
  shareAudience?: "all-recruiters";
  consentToAllRecruiters?: boolean;
  competencyVersionIds?: string[];
}): Promise<ShareWalletCompetencyResult> {
  return apiRequest<ShareWalletCompetencyResult>(
    `/wallet/competencies/${encodeURIComponent(input.competencyId)}/share`,
    {
      method: "POST",
      body: JSON.stringify({
        selectionMode: input.selectionMode,
        selectedFields: input.selectedFields,
        evidenceModes: input.evidenceModes,
        shareScope: input.shareScope,
        expiresInDays: input.expiresInDays,
        recipientUserId: input.recipientUserId,
        shareAudience: input.shareAudience,
        consentToAllRecruiters: input.consentToAllRecruiters,
        competencyVersionIds: input.competencyVersionIds,
      }),
    },
  );
}

export interface OwnerShareSummary {
  id: string;
  label: string;
  shareKind: "all-recruiters" | "direct-recruiter" | "public-link";
  recipientName: string | null;
  recipientOrganization: string | null;
  shareStatus: "Active" | "Expired" | "Revoked";
  createdAt: string;
  expiresAt: string | null;
}

export async function listOwnerSharesApi(): Promise<OwnerShareSummary[]> {
  return apiRequest<OwnerShareSummary[]>("/wallet/shares");
}

export async function revokeWalletShareApi(shareId: string): Promise<boolean> {
  if (!isApiEnabled()) return false;
  try {
    await apiRequest<null>(
      `/wallet/shares/${encodeURIComponent(shareId)}/revoke`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
}

export async function emailPublicShareApi(input: {
  shareId: string;
  recipientEmail: string;
  token: string;
}): Promise<{ sent: true; recipientEmail: string }> {
  return apiRequest<{ sent: true; recipientEmail: string }>(
    `/wallet/shares/${encodeURIComponent(input.shareId)}/email`,
    {
      method: "POST",
      body: JSON.stringify({
        recipientEmail: input.recipientEmail,
        token: input.token,
      }),
    },
  );
}

export async function getPublicPresentationApi(
  token: string,
): Promise<PublicPresentationView> {
  return apiRequest<PublicPresentationView>(
    `/public/presentations/${encodeURIComponent(token)}`,
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function verifyPublicPresentationApi(
  token: string,
  disclosedPayload?: Record<string, unknown>,
): Promise<PublicPresentationView> {
  return apiRequest<PublicPresentationView>(
    `/public/presentations/${encodeURIComponent(token)}/verify`,
    {
      method: "POST",
      body: JSON.stringify(disclosedPayload ? { disclosedPayload } : {}),
    },
  );
}

export interface DisclosurePreferences {
  shareExactAssessmentMarks: boolean;
  shareExactGithubCommitCount: boolean;
  updatedAt: string | null;
}

export function getDisclosurePreferencesApi(): Promise<DisclosurePreferences> {
  return apiRequest<DisclosurePreferences>("/wallet/disclosure-preferences");
}

export function updateDisclosurePreferencesApi(
  patch: Partial<Pick<DisclosurePreferences, "shareExactAssessmentMarks" | "shareExactGithubCommitCount">>,
): Promise<DisclosurePreferences> {
  return apiRequest<DisclosurePreferences>("/wallet/disclosure-preferences", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

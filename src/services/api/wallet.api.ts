import { apiRequest, tryApiRequest } from "./client";
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

export async function shareWalletCompetencyApi(input: {
  competencyId: string;
  selectionMode: WalletShareSelectionMode;
  selectedFields: WalletShareFieldId[];
  expiresInDays?: number;
}): Promise<ShareWalletCompetencyResult> {
  return apiRequest<ShareWalletCompetencyResult>(
    `/wallet/competencies/${encodeURIComponent(input.competencyId)}/share`,
    {
      method: "POST",
      body: JSON.stringify({
        selectionMode: input.selectionMode,
        selectedFields: input.selectedFields,
        expiresInDays: input.expiresInDays,
      }),
    },
  );
}

export async function revokeWalletShareApi(shareId: string): Promise<boolean> {
  const result = await tryApiRequest<null>(
    `/wallet/shares/${encodeURIComponent(shareId)}/revoke`,
    { method: "POST" },
  );
  return result !== null;
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

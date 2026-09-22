import { supabase } from "@/integrations/supabase/client";
import { apiRequest, isApiEnabled } from "./client";
import type {
  PublicCompetencyResponse,
  PublicCredentialResponse,
  WalletExportAvailability,
} from "@/lib/public-credential";

function functionsBase(): string {
  return `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "")}/functions/v1`;
}

async function fetchFunctionJson<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${functionsBase()}/${path.replace(/^\//, "")}`, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });
  const json = await res.json() as { success?: boolean; data?: T; error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return (json.data ?? json) as T;
}

export async function getPublicCredentialApi(shareToken: string): Promise<PublicCredentialResponse> {
  if (isApiEnabled()) {
    return apiRequest<PublicCredentialResponse>(
      `/public/credentials/${encodeURIComponent(shareToken)}`,
    );
  }
  return fetchFunctionJson<PublicCredentialResponse>(`public-credential/${encodeURIComponent(shareToken)}`);
}

export async function getPublicCompetencyApi(
  shareToken: string,
  competencyId: string,
): Promise<PublicCompetencyResponse> {
  if (isApiEnabled()) {
    try {
      return await apiRequest<PublicCompetencyResponse>(
        `/public/credentials/${encodeURIComponent(shareToken)}/competencies/${encodeURIComponent(competencyId)}`,
      );
    } catch {
      // Fall through to the public Edge Function.
    }
  }
  return fetchFunctionJson<PublicCompetencyResponse>(
    `public-competency/${encodeURIComponent(shareToken)}/${encodeURIComponent(competencyId)}`,
  );
}

export async function getWalletExportConfigApi(): Promise<WalletExportAvailability> {
  if (isApiEnabled()) {
    try {
      return await apiRequest<WalletExportAvailability>("/public/wallet-export/config");
    } catch {
      return { apple: false, google: false };
    }
  }
  return { apple: false, google: false };
}

export function publicResumePdfUrl(shareToken: string): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  if (apiBase) {
    return `${apiBase}/public/credentials/${encodeURIComponent(shareToken)}/resume.pdf`;
  }
  return `${functionsBase()}/resume-pdf/${encodeURIComponent(shareToken)}`;
}

export function publicResumePhotoUrl(shareToken: string): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  if (apiBase) {
    return `${apiBase}/public/credentials/${encodeURIComponent(shareToken)}/photo`;
  }
  return `${functionsBase()}/public-credential/${encodeURIComponent(shareToken)}/photo`;
}

export function ownerResumePdfUrl(shareId: string): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return `${apiBase}/wallet/shares/${encodeURIComponent(shareId)}/resume.pdf`;
}

export function ownerWalletResumePdfUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return `${apiBase}/wallet/resume.pdf`;
}

export function appleWalletPassUrl(shareToken: string): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  if (apiBase) {
    return `${apiBase}/public/credentials/${encodeURIComponent(shareToken)}/apple-wallet`;
  }
  return `${functionsBase()}/apple-wallet-pass/${encodeURIComponent(shareToken)}`;
}

export async function getGoogleWalletLinkApi(shareToken: string): Promise<string> {
  if (isApiEnabled()) {
    const result = await apiRequest<{ saveUrl: string }>(
      `/public/credentials/${encodeURIComponent(shareToken)}/google-wallet`,
    );
    return result.saveUrl;
  }
  const result = await fetchFunctionJson<{ saveUrl?: string; verifyUrl?: string }>(
    `google-wallet-pass/${encodeURIComponent(shareToken)}`,
  );
  if (!result.saveUrl) throw new Error("Google Wallet is not configured");
  return result.saveUrl;
}

export async function getOwnerShareResumeApi(shareId: string): Promise<{
  status: PublicCredentialResponse["status"];
  resume: PublicCredentialResponse["resume"];
  resumeText: string | null;
}> {
  return apiRequest(`/wallet/shares/${encodeURIComponent(shareId)}/resume`);
}

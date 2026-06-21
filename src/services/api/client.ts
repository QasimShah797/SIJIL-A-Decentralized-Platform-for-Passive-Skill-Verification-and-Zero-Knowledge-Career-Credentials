/**
 * HTTP client for the SIJIL custom backend API.
 * Falls back gracefully when VITE_API_BASE_URL is unset or the API is unreachable.
 */
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export function isApiEnabled(): boolean {
  return Boolean(BASE_URL);
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export class ApiUnavailableError extends Error {
  constructor(message = "Backend API unavailable") {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!BASE_URL) throw new ApiUnavailableError("VITE_API_BASE_URL not configured");

  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    throw new ApiUnavailableError(`API ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new ApiUnavailableError(json.message || "API request failed");
  }

  return json.data;
}

/** Try backend API; return null on any failure so callers can fall back to Supabase. */
export async function tryApiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    return await apiRequest<T>(path, options);
  } catch {
    return null;
  }
}

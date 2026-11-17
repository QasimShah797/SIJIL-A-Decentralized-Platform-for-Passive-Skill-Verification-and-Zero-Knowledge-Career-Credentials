import { apiRequest, tryApiRequest } from "@/services/api/client";

export type ShortlistEntry = {
  id: string;
  recruiterUserId: string;
  learnerUserId: string;
  note: string;
  createdAt: string;
};

export type SharedCompetencyVersion = {
  id: string;
  skillName: string;
  versionNumber: number;
  status: "pending_evidence" | "awaiting_validation" | "issued";
  anchorStatus: "not_requested" | "unavailable" | "confirmed" | "failed";
  createdAt: string;
  credentialId: string | null;
  hasCredential: boolean;
};

export function listShortlist(): Promise<{ available: boolean; entries: ShortlistEntry[] } | null> {
  return tryApiRequest("/recruiter/shortlist");
}

export function saveShortlist(learnerUserId: string, note = ""): Promise<ShortlistEntry> {
  return apiRequest("/recruiter/shortlist", { method: "POST", body: JSON.stringify({ learnerUserId, note }) });
}

export function deleteShortlist(learnerUserId: string): Promise<{ removed: boolean }> {
  return apiRequest(`/recruiter/shortlist/${encodeURIComponent(learnerUserId)}`, { method: "DELETE" });
}

export function listSharedCompetencyVersions(learnerUserId: string, skill?: string): Promise<{ available: boolean; versions: SharedCompetencyVersion[] } | null> {
  const query = skill ? `?skill=${encodeURIComponent(skill)}` : "";
  return tryApiRequest(`/recruiter/candidates/${encodeURIComponent(learnerUserId)}/competency-versions${query}`);
}

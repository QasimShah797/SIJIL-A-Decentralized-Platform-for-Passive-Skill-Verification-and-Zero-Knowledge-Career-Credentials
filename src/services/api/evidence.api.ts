/**
 * Evidence API — backend layer for evidence submission with Supabase fallback.
 */
import { tryApiRequest } from "./client";

export interface EvidenceApiView {
  id: string;
  skillId: string;
  source: string;
  title: string;
  url: string | null;
  occurredAt: string;
  status: string;
}

export async function submitEvidenceApi(input: {
  skillId: string;
  title: string;
  url?: string;
  source?: string;
}): Promise<EvidenceApiView | null> {
  return tryApiRequest<EvidenceApiView>("/evidence", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listEvidenceApi(skillId: string): Promise<EvidenceApiView[] | null> {
  return tryApiRequest<EvidenceApiView[]>(`/evidence/${skillId}`);
}

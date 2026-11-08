import { supabase } from "@/integrations/supabase/client";
import type { SharedPresentation } from "@/lib/sijil-data";

function rowToPresentation(row: Record<string, unknown>): SharedPresentation {
  return {
    token: row.token as string,
    credentialId: row.credential_uri as string,
    candidateId: row.candidate_user_id as string,
    recipient: row.recipient as string,
    recipientDid: row.recipient_did as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    revoked: row.revoked as boolean,
    disclosedFields: row.disclosed_fields as SharedPresentation["disclosedFields"],
    hiddenFields: row.hidden_fields as string[],
    proof: row.proof as SharedPresentation["proof"],
  };
}

export async function fetchPresentation(token: string): Promise<SharedPresentation | null> {
  const rpc = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: { p_token: string },
    ) => Promise<{ data: Record<string, unknown> | Record<string, unknown>[] | null; error: { code?: string; message?: string } | null }>;
  }).rpc("presentation_by_token", { p_token: token });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!row) return null;
    return rowToPresentation(row);
  }
  const missingFunction = rpc.error.code === "PGRST202"
    || /presentation_by_token|could not find the function/i.test(rpc.error.message ?? "");
  if (!missingFunction) throw rpc.error;

  const { data, error } = await supabase
    .from("presentations")
    .select(`
      *,
      credentials ( credential_uri )
    `)
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToPresentation({
    ...data,
    credential_uri: (data.credentials as { credential_uri: string } | null)?.credential_uri ?? "",
  });
}

export async function savePresentationDb(
  userId: string,
  credentialDbId: string,
  candidateUserId: string,
  p: SharedPresentation,
): Promise<void> {
  const { error } = await supabase.from("presentations").upsert({
    token: p.token,
    user_id: userId,
    credential_id: credentialDbId,
    candidate_user_id: candidateUserId,
    recipient: p.recipient,
    recipient_did: p.recipientDid,
    expires_at: p.expiresAt,
    revoked: p.revoked,
    disclosed_fields: p.disclosedFields,
    hidden_fields: p.hiddenFields,
    proof: p.proof,
  });
  if (error) throw error;
}

export async function revokePresentationDb(token: string): Promise<void> {
  const { error } = await supabase.from("presentations").update({ revoked: true }).eq("token", token);
  if (error) throw error;
}

export async function fetchPresentationsForCandidate(_candidateUserId: string): Promise<SharedPresentation[]> {
  return [];
}

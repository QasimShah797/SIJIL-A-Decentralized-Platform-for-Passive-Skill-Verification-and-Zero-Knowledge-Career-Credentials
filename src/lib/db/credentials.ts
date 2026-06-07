import { supabase } from "@/integrations/supabase/client";

export type CredentialView = {
  id: string;
  name: string;
  type: string[];
  issuer: string;
  issuerDid: string;
  holderDid: string;
  validFrom: string;
  verification: string;
  attestation: string;
  supportingRecords: number;
  skill: string;
  proof?: Record<string, unknown>;
};

function rowToCredential(row: {
  id: string;
  credential_uri: string;
  name: string;
  credential_types: string[];
  issuer_name: string;
  issuer_did: string;
  holder_did: string;
  valid_from: string;
  verification_status: string;
  attestation_status: string;
  supporting_records: number;
  skill_name: string | null;
  proof: unknown;
}): CredentialView {
  return {
    id: row.credential_uri,
    name: row.name,
    type: row.credential_types,
    issuer: row.issuer_name,
    issuerDid: row.issuer_did,
    holderDid: row.holder_did,
    validFrom: row.valid_from,
    verification: row.verification_status,
    attestation: row.attestation_status,
    supportingRecords: row.supporting_records,
    skill: row.skill_name ?? "—",
    proof: (row.proof as Record<string, unknown>) ?? undefined,
  };
}

export async function fetchCredentials(userId: string): Promise<CredentialView[]> {
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .eq("user_id", userId)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCredential);
}

export async function fetchCredentialsForUsers(userIds: string[]): Promise<Record<string, CredentialView[]>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .in("user_id", userIds);
  if (error) throw error;
  const map: Record<string, CredentialView[]> = {};
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (!map[uid]) map[uid] = [];
    map[uid].push(rowToCredential(row));
  }
  return map;
}

export async function fetchCredentialByUri(userId: string, uri: string): Promise<CredentialView | null> {
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("credential_uri", uri)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCredential(data) : null;
}

/** Resolve credential by URI across users (recruiter verify flow). */
export async function fetchCredentialByUriGlobal(uri: string): Promise<CredentialView | null> {
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .eq("credential_uri", uri)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCredential(data) : null;
}

export async function getCredentialDbId(uri: string): Promise<string | null> {
  const { data } = await supabase
    .from("credentials")
    .select("id")
    .eq("credential_uri", uri)
    .maybeSingle();
  return data?.id ?? null;
}

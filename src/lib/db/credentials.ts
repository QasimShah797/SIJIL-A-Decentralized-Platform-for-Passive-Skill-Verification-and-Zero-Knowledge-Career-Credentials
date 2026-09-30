import { supabase } from "@/integrations/supabase/client";
import { getCredentialApi, getWalletApi } from "@/services/api/credentials.api";
import { verifyCredentialApi } from "@/services/api/recruiter.api";
import { apiRequest } from "@/services/api/client";

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
  anchorStatus?: string;
  anchorTxId?: string | null;
  anchoredAt?: string | null;
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
  anchor_status?: string | null;
  anchor_tx_id?: string | null;
  anchored_at?: string | null;
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
    anchorStatus: row.anchor_status ?? undefined,
    anchorTxId: row.anchor_tx_id ?? null,
    anchoredAt: row.anchored_at ?? null,
  };
}

export async function fetchCredentials(userId: string): Promise<CredentialView[]> {
  const viaApi = await getWalletApi(userId);
  if (viaApi) return viaApi;

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
  const viaApi = await getCredentialApi(uri);
  if (viaApi) return viaApi;

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

/** Issue credential for a wallet-ready skill. Writes go only through the Express backend. */
export async function issueCredentialForSkill(
  _userId: string,
  skillId: string,
): Promise<CredentialView | null> {
  return apiRequest<CredentialView>("/credentials/issue", {
    method: "POST",
    body: JSON.stringify({ skillId }),
  });
}

/** Recruiter verify with selective disclosure — backend first, Supabase fallback. */
export async function verifyCredentialForRecruiter(
  credentialOrToken: string,
): Promise<{ credential: CredentialView | Partial<CredentialView>; disclosedOnly: boolean } | null> {
  const viaApi = await verifyCredentialApi(credentialOrToken);
  if (viaApi?.credential) {
    return {
      credential: viaApi.credential as CredentialView,
      disclosedOnly: (viaApi.disclosedFields?.length ?? 0) > 0,
    };
  }

  const cred = await fetchCredentialByUriGlobal(credentialOrToken);
  if (!cred) return null;
  return { credential: cred, disclosedOnly: false };
}

import { supabase } from "@/integrations/supabase/client";
import { issueCredentialApi, getCredentialApi } from "@/services/api/credentials.api";
import { verifyCredentialApi } from "@/services/api/recruiter.api";
import { holderDidFromUserId } from "@/lib/did";

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

function issuerDidFromInstitution(institution: string): string {
  const slug = institution.toLowerCase().replace(/\s+/g, "");
  return `did:web:issuer.${slug}.edu.pk`;
}

/** Issue credential for a wallet-ready skill — backend first, Supabase fallback. */
export async function issueCredentialForSkill(
  userId: string,
  skillId: string,
): Promise<CredentialView | null> {
  const viaApi = await issueCredentialApi(skillId);
  if (viaApi) return viaApi;

  const { data: skill, error: skillErr } = await supabase
    .from("declared_skills")
    .select("*")
    .eq("user_id", userId)
    .eq("id", skillId)
    .maybeSingle();
  if (skillErr) throw skillErr;
  if (!skill) return null;

  const stage = skill.pipeline_stage as string;
  if (stage !== "wallet_ready" && stage !== "in_wallet") return null;

  const { data: existing } = await supabase
    .from("credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("skill_name", skill.name)
    .maybeSingle();
  if (existing) return rowToCredential(existing);

  const { data: profile } = await supabase
    .from("learner_profiles")
    .select("institution_name, holder_did")
    .eq("user_id", userId)
    .maybeSingle();

  const institution = profile?.institution_name ?? "CUST";
  const holderDid = profile?.holder_did ?? holderDidFromUserId(userId);
  const issuerDid = issuerDidFromInstitution(institution);
  const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const credentialUri = `urn:uuid:sijil:${userId.replace(/-/g, "").slice(0, 8)}:${slug}:${Date.now()}`;

  const { count: evidenceCount } = await supabase
    .from("supporting_records")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  const proofPayload = JSON.stringify({
    credentialUri,
    issuerDid,
    holderDid,
    skillName: skill.name,
    ts: Date.now(),
  });

  const { data, error } = await supabase
    .from("credentials")
    .insert({
      user_id: userId,
      credential_uri: credentialUri,
      name: `${skill.name} Competency Credential`,
      credential_types: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer_name: institution,
      issuer_did: issuerDid,
      holder_did: holderDid,
      valid_from: new Date().toISOString(),
      verification_status: "Verified",
      attestation_status: "Approved",
      supporting_records: evidenceCount ?? 0,
      skill_name: skill.name,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "sha256-2024-mock",
        created: new Date().toISOString(),
        verificationMethod: `${issuerDid}#key-1`,
        proofValue: `0x${await sha256Hex(proofPayload)}`,
        proofPurpose: "assertionMethod",
      },
    })
    .select("*")
    .single();
  if (error) throw error;

  await supabase
    .from("declared_skills")
    .update({
      pipeline_stage: "in_wallet",
      status: "Credential Issued",
      last_credential_sync_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", skillId);

  return rowToCredential(data);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Recruiter verify with selective disclosure — backend first, Supabase fallback. */
export async function verifyCredentialForRecruiter(
  credentialOrToken: string,
): Promise<{ credential: CredentialView | Partial<CredentialView>; disclosedOnly: boolean } | null> {
  const viaApi = await verifyCredentialApi(credentialOrToken);
  if (viaApi) {
    return {
      credential: viaApi.credential as CredentialView,
      disclosedOnly: viaApi.disclosedFields.length > 0,
    };
  }

  const cred = await fetchCredentialByUriGlobal(credentialOrToken);
  if (!cred) return null;
  return { credential: cred, disclosedOnly: false };
}

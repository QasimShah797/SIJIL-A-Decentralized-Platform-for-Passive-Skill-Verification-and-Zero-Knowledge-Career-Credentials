/**
 * Verifiable credential issuing, wallet retrieval, and selective disclosure sharing.
 */
import { supabaseService } from "./supabase.service";
import { buildCredentialProof } from "./proof.service";
import { AppError } from "../utils/AppError";
import {
  CredentialRow,
  CredentialView,
  IssueCredentialInput,
  RevokeShareInput,
  ShareCredentialInput,
} from "../types/credentials.types";
import { CREDENTIAL_VERIFICATION, PIPELINE_STAGE, SKILL_STATUS } from "../constants/status";
import { generateCredentialUri } from "../utils/generateHash";
import { randomUUID } from "node:crypto";

function rowToView(row: CredentialRow): CredentialView {
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

function issuerDidFromInstitution(institution: string): string {
  const slug = institution.toLowerCase().replace(/\s+/g, "");
  return `did:web:issuer.${slug}.edu.pk`;
}

function holderDidFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "");
  return `did:key:z6Mk${compact.slice(0, 32)}${compact.slice(-8)}`;
}

export class CredentialsService {
  async issue(userId: string, input: IssueCredentialInput): Promise<CredentialView> {
    const { data: skill, error: skillErr } = await supabaseService.client
      .from("declared_skills")
      .select("*")
      .eq("user_id", userId)
      .eq("id", input.skillId)
      .maybeSingle();

    if (skillErr) throw new AppError(skillErr.message, 500);
    if (!skill) throw new AppError("Skill not found", 404);

    const stage = skill.pipeline_stage as string;
    if (stage !== PIPELINE_STAGE.WALLET_READY && stage !== PIPELINE_STAGE.IN_WALLET) {
      throw new AppError("Skill is not eligible for credential issuance", 400);
    }

    const { data: existing } = await supabaseService.client
      .from("credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("skill_name", skill.name)
      .maybeSingle();

    if (existing) return rowToView(existing as CredentialRow);

    const { data: profile } = await supabaseService.client
      .from("learner_profiles")
      .select("institution_name, holder_did")
      .eq("user_id", userId)
      .maybeSingle();

    const institution = (profile?.institution_name as string) ?? "CUST";
    const holderDid = (profile?.holder_did as string) ?? holderDidFromUserId(userId);
    const issuerDid = issuerDidFromInstitution(institution);
    const credentialUri = generateCredentialUri(userId, skill.name);

    const { count: evidenceCount } = await supabaseService.client
      .from("supporting_records")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("skill_id", input.skillId);

    const proof = buildCredentialProof({
      credentialUri,
      issuerDid,
      holderDid,
      skillName: skill.name,
    });

    const { data, error } = await supabaseService.client
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
        verification_status: CREDENTIAL_VERIFICATION.VERIFIED,
        attestation_status: "Approved",
        supporting_records: evidenceCount ?? 0,
        skill_name: skill.name,
        proof,
      })
      .select("*")
      .single();

    if (error) throw new AppError(error.message, 500);

    await supabaseService.client
      .from("declared_skills")
      .update({
        pipeline_stage: PIPELINE_STAGE.IN_WALLET,
        status: SKILL_STATUS.CREDENTIAL_ISSUED,
        last_credential_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", input.skillId);

    return rowToView(data as CredentialRow);
  }

  async getByUri(credentialUri: string): Promise<CredentialView> {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select("*")
      .eq("credential_uri", credentialUri)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError("Credential not found", 404);
    return rowToView(data as CredentialRow);
  }

  async getWallet(learnerId: string): Promise<CredentialView[]> {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select("*")
      .eq("user_id", learnerId)
      .order("valid_from", { ascending: false });

    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => rowToView(row as CredentialRow));
  }

  async share(userId: string, input: ShareCredentialInput): Promise<{ token: string; shareUrl: string }> {
    const { data: cred, error: credErr } = await supabaseService.client
      .from("credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("credential_uri", input.credentialId)
      .maybeSingle();

    if (credErr) throw new AppError(credErr.message, 500);
    if (!cred) throw new AppError("Credential not found", 404);

    const token = randomUUID();
    const expiresAt = new Date(
      Date.now() + (input.expiresInDays ?? 90) * 86_400_000,
    ).toISOString();

    const proof = buildCredentialProof({
      credentialUri: cred.credential_uri as string,
      issuerDid: cred.issuer_did as string,
      holderDid: cred.holder_did as string,
      skillName: (cred.skill_name as string) ?? "",
    });

    const { error } = await supabaseService.client.from("presentations").upsert({
      token,
      user_id: userId,
      credential_id: cred.id,
      candidate_user_id: userId,
      recipient: input.recipient,
      recipient_did: input.recipientDid ?? "",
      expires_at: expiresAt,
      revoked: false,
      disclosed_fields: input.disclosedFields,
      hidden_fields: input.hiddenFields ?? [],
      proof,
    });

    if (error) throw new AppError(error.message, 500);

    return { token, shareUrl: `/recruiter/verify/${encodeURIComponent(token)}` };
  }

  async revokeShare(input: RevokeShareInput): Promise<void> {
    const { error } = await supabaseService.client
      .from("presentations")
      .update({ revoked: true })
      .eq("token", input.token);

    if (error) throw new AppError(error.message, 500);
  }
}

export const credentialsService = new CredentialsService();

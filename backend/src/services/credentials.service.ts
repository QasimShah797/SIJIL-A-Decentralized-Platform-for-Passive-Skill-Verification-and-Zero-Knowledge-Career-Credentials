/**
 * Verifiable credential issuing, wallet retrieval, and selective disclosure sharing.
 */
import { supabaseService } from "./supabase.service";
import { buildCredentialDocument } from "./credential-document.service";
import {
  CREDENTIAL_CRYPTOSUITE,
  CREDENTIAL_PROOF_TYPE,
  issuerVerificationMethod,
  signCredentialHash,
} from "./signing.service";
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
import { getLedgerService } from "./ledger.factory";
import { evaluateIssuanceEligibility } from "./issuance-gate";
import { canReadLearnerData, isActiveShareRow, type AuthCaller } from "./learner-access";
import { hashEvidenceMetadata, sortedEvidenceHashes } from "../utils/evidence-hash";
import { credentialFromDisclosedFields, type DisclosedField } from "./recruiter-disclose";
import { ROLES } from "../constants/roles";

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
    anchorStatus: row.anchor_status ?? undefined,
    anchorTxId: row.anchor_tx_id ?? null,
    anchoredAt: row.anchored_at ?? null,
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

async function callerHasActiveShare(learnerId: string): Promise<boolean> {
  const [{ data: walletShares }, { data: presentations }] = await Promise.all([
    supabaseService.client
      .from("selective_disclosure_presentations")
      .select("expires_at, revoked_at")
      .eq("learner_id", learnerId)
      .is("revoked_at", null),
    supabaseService.client
      .from("presentations")
      .select("expires_at, revoked")
      .eq("candidate_user_id", learnerId)
      .eq("revoked", false),
  ]);

  const walletActive = (walletShares ?? []).some((row) =>
    isActiveShareRow({
      revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
      expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    }),
  );
  if (walletActive) return true;

  return (presentations ?? []).some((row) =>
    isActiveShareRow({
      revoked: Boolean(row.revoked),
      expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    }),
  );
}

async function assertCanReadLearner(caller: AuthCaller, ownerId: string): Promise<void> {
  const hasActiveShare = caller.roles.includes(ROLES.ADMIN)
    ? true
    : caller.roles.includes(ROLES.RECRUITER)
      ? await callerHasActiveShare(ownerId)
      : false;
  if (!canReadLearnerData({ caller, ownerId, hasActiveShare })) {
    throw new AppError("Not authorized to read this learner's credentials", 403);
  }
}

function recruiterLimited(caller: AuthCaller, ownerId: string): boolean {
  return caller.id !== ownerId
    && caller.roles.includes(ROLES.RECRUITER)
    && !caller.roles.includes(ROLES.ADMIN);
}

function disclosedFieldsFromUnknown(value: unknown): DisclosedField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const fieldValue = record.value;
    if (!id) return [];
    return [{
      id,
      label: typeof record.label === "string" ? record.label : undefined,
      value: fieldValue == null ? "" : String(fieldValue),
    }];
  });
}

async function disclosedCredentialViews(
  learnerId: string,
  credentialUri?: string,
): Promise<Partial<CredentialView>[]> {
  const query = supabaseService.client
    .from("presentations")
    .select("disclosed_fields, credentials ( credential_uri )")
    .eq("candidate_user_id", learnerId)
    .eq("revoked", false);
  const { data, error } = await query;
  if (error && !/schema cache|does not exist|could not find the table/i.test(error.message)) {
    throw new AppError(error.message, 500);
  }

  const views: Partial<CredentialView>[] = [];
  for (const row of data ?? []) {
    const rawCred = (row as { credentials?: { credential_uri?: string } | { credential_uri?: string }[] }).credentials;
    const cred = Array.isArray(rawCred) ? rawCred[0] : rawCred;
    const uri = cred?.credential_uri;
    if (credentialUri && uri !== credentialUri) continue;
    views.push(credentialFromDisclosedFields(
      disclosedFieldsFromUnknown((row as { disclosed_fields?: unknown }).disclosed_fields),
      uri ? { id: uri } : undefined,
    ));
  }
  return views;
}

export class CredentialsService {
  async issue(userId: string, input: IssueCredentialInput): Promise<CredentialView> {
    const { data: skill, error: skillErr } = await supabaseService.client
      .from("declared_skills")
      .select("*")
      .eq("id", input.skillId)
      .maybeSingle();

    if (skillErr) throw new AppError(skillErr.message, 500);
    if (!skill) throw new AppError("Skill not found", 404);

    const { data: evidenceRows, error: evidenceErr } = await supabaseService.client
      .from("supporting_records")
      .select("source, title, url, content_hash")
      .eq("user_id", userId)
      .eq("skill_id", input.skillId);

    if (evidenceErr) throw new AppError(evidenceErr.message, 500);

    const gate = evaluateIssuanceEligibility({
      skillOwnerId: String(skill.user_id),
      requestUserId: userId,
      pipelineStage: String(skill.pipeline_stage ?? ""),
      evidence: (evidenceRows ?? []).map((row) => ({
        source: String(row.source ?? ""),
        title: typeof row.title === "string" ? row.title : undefined,
        url: typeof row.url === "string" ? row.url : null,
        contentHash: typeof row.content_hash === "string" ? row.content_hash : null,
      })),
    });
    if (!gate.ok) throw new AppError(gate.message, gate.status);

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

    const evidenceHashes = sortedEvidenceHashes(
      (evidenceRows ?? []).map((row) => {
        if (typeof row.content_hash === "string" && row.content_hash.length > 0) {
          return row.content_hash;
        }
        return hashEvidenceMetadata({
          source: String(row.source ?? ""),
          title: String(row.title ?? ""),
          url: typeof row.url === "string" ? row.url : null,
        });
      }),
    );

    const validFrom = new Date().toISOString();
    const { document, sha256Hash } = buildCredentialDocument({
      credentialUri,
      issuerDid,
      holderDid,
      skill: skill.name as string,
      evidenceCount: evidenceHashes.length,
      evidenceHashes,
      validFrom,
    });

    const proofValue = signCredentialHash(sha256Hash);
    const proof = {
      type: CREDENTIAL_PROOF_TYPE,
      cryptosuite: CREDENTIAL_CRYPTOSUITE,
      created: validFrom,
      verificationMethod: issuerVerificationMethod(issuerDid),
      proofValue,
      proofPurpose: "assertionMethod",
    };

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
        valid_from: validFrom,
        verification_status: CREDENTIAL_VERIFICATION.VERIFIED,
        attestation_status: "Approved",
        supporting_records: evidenceHashes.length,
        skill_name: skill.name,
        proof,
        credential_document: document,
        credential_hash: sha256Hash,
        anchor_status: "pending",
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

  async getByUri(credentialUri: string, caller: AuthCaller): Promise<CredentialView | Partial<CredentialView>> {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select("*")
      .eq("credential_uri", credentialUri)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError("Credential not found", 404);
    const row = data as CredentialRow;
    await assertCanReadLearner(caller, row.user_id);
    if (recruiterLimited(caller, row.user_id)) {
      const disclosed = await disclosedCredentialViews(row.user_id, credentialUri);
      if (disclosed[0]) return disclosed[0];
      throw new AppError("Not authorized to read this learner's credentials", 403);
    }
    return rowToView(row);
  }

  async getWallet(learnerId: string, caller: AuthCaller): Promise<Array<CredentialView | Partial<CredentialView>>> {
    await assertCanReadLearner(caller, learnerId);
    if (recruiterLimited(caller, learnerId)) {
      return disclosedCredentialViews(learnerId);
    }
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

    const issued = cred as CredentialRow;
    if (issued.revoked_at) {
      throw new AppError("Cannot create a presentation for a revoked credential", 409);
    }
    const ledger = getLedgerService();
    if (ledger.isEnabled() && issued.credential_hash) {
      try {
        const onChain = await ledger.verifyCredential(issued.id, issued.credential_hash);
        if (onChain.exists && onChain.status === "revoked") {
          throw new AppError("Cannot create a presentation for a revoked credential", 409);
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }

    const token = randomUUID();
    const expiresAt = new Date(
      Date.now() + (input.expiresInDays ?? 90) * 86_400_000,
    ).toISOString();

    const storedProof = (cred.proof as Record<string, unknown> | null) ?? {};

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
      proof: storedProof,
    });

    if (error) throw new AppError(error.message, 500);

    return { token, shareUrl: `/recruiter/verify/${encodeURIComponent(token)}` };
  }

  async revokeShare(userId: string, input: RevokeShareInput): Promise<void> {
    const { data, error } = await supabaseService.client
      .from("presentations")
      .update({ revoked: true })
      .eq("token", input.token)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError("Share not found", 404);
  }
}

export const credentialsService = new CredentialsService();

/**
 * Verifiable credential types for issuing and wallet operations.
 */
export interface CredentialRow {
  id: string;
  user_id: string;
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
  proof: Record<string, unknown> | null;
  credential_document?: Record<string, unknown> | null;
  credential_hash?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  anchor_status?: string;
  anchor_tx_id?: string | null;
  anchored_at?: string | null;
  anchor_attempts?: number;
  anchor_last_error?: string | null;
  revoke_status?: string;
  revoke_attempts?: number;
  revoke_last_error?: string | null;
  revoke_tx_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialView {
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
}

export interface IssueCredentialInput {
  skillId: string;
}

export interface ShareCredentialInput {
  credentialId: string;
  recipient: string;
  recipientDid?: string;
  disclosedFields: { id: string; label: string; value: string }[];
  hiddenFields?: string[];
  expiresInDays?: number;
}

export interface RevokeShareInput {
  token: string;
}

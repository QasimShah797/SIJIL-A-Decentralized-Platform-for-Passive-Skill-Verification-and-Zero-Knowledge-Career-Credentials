/** Ledger record: opaque identifiers, hashes, DIDs, and status only. */
export type CredentialStatus = 'active' | 'revoked';

export interface CredentialAnchorRecord {
  credentialId: string;
  hash: string;
  issuerDid: string;
  holderDid: string;
  issuedAt: string;
  status: CredentialStatus;
  revokedAt: string;
  revocationReason: string;
}

export interface VerifyCredentialResult {
  exists: boolean;
  hashMatches: boolean;
  status: string;
}

export interface HistoryEntry {
  txId: string;
  timestamp: string;
  isDelete: boolean;
  record: CredentialAnchorRecord | null;
}

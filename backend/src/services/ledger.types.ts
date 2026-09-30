export interface AnchorCredentialInput {
  credentialId: string;
  hash: string;
  issuerDid: string;
  holderDid: string;
  issuedAt: string;
}

export interface AnchorResult {
  txId: string;
}

export interface VerifyCredentialResult {
  exists: boolean;
  hashMatches: boolean;
  status: string;
}

export interface LedgerHistoryEntry {
  txId: string;
  timestamp: string;
  isDelete: boolean;
  record: {
    credentialId: string;
    hash: string;
    issuerDid: string;
    holderDid: string;
    issuedAt: string;
    status: string;
    revokedAt: string;
    revocationReason: string;
  } | null;
}

export interface LedgerPort {
  isEnabled(): boolean;
  isReachable(): Promise<boolean>;
  anchorCredential(input: AnchorCredentialInput): Promise<AnchorResult>;
  revokeCredential(credentialId: string, reason: string): Promise<AnchorResult>;
  verifyCredential(credentialId: string, hash: string): Promise<VerifyCredentialResult>;
  getHistory(credentialId: string): Promise<LedgerHistoryEntry[]>;
  close(): void;
}

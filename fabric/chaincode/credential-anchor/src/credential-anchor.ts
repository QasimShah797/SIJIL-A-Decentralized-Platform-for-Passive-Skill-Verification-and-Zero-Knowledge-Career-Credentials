import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from 'fabric-contract-api';
import type {
  CredentialAnchorRecord,
  HistoryEntry,
  VerifyCredentialResult,
} from './types';

/** Test-network issuer organisation. Org2MSP and others cannot mutate anchors. */
export const ISSUER_MSP_ID = 'Org1MSP';

/**
 * Application writer. Org1 admin is not a writer after this chaincode version.
 * Reads stay open to any channel member. Upgrade is required before this rule
 * is enforced on a running network; see fabric/OPERATIONS.md.
 */
export const APP_WRITER_CN = 'sijil-app';
export const CHAINCODE_VERSION = '1.1.0';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HISTORY_LIMIT = 100;

const EVENT_ANCHORED = 'CredentialAnchored';
const EVENT_REVOKED = 'CredentialRevoked';

interface TxTimestampLike {
  seconds?: number | { low?: number; toNumber?: () => number };
  nanos?: number;
}

@Info({
  title: 'CredentialAnchor',
  description:
    'Stores immutable credential hashes and revocation status. No personal data.',
})
export class CredentialAnchor extends Contract {
  constructor() {
    super('CredentialAnchor');
  }

  @Transaction()
  public async AnchorCredential(
    ctx: Context,
    credentialId: string,
    hash: string,
    issuerDid: string,
    holderDid: string,
    issuedAt: string,
  ): Promise<CredentialAnchorRecord> {
    this.assertWriter(ctx);
    const id = requireCredentialId(credentialId);
    const digest = requireSha256(hash);
    const issuer = requireDid(issuerDid, 'issuerDid');
    const holder = requireDid(holderDid, 'holderDid');
    const issued = requireIssuedAt(issuedAt);

    const existing = await ctx.stub.getState(id);
    if (existing && existing.length > 0) {
      throw new Error(`credential ${id} is already anchored (immutable)`);
    }

    const record: CredentialAnchorRecord = {
      credentialId: id,
      hash: digest,
      issuerDid: issuer,
      holderDid: holder,
      issuedAt: issued,
      status: 'active',
      revokedAt: '',
      revocationReason: '',
    };

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(record), 'utf8'));
    ctx.stub.setEvent(EVENT_ANCHORED, Buffer.from(JSON.stringify({
      credentialId: id,
      hash: digest,
      issuerDid: issuer,
      holderDid: holder,
      issuedAt: issued,
      status: record.status,
    }), 'utf8'));

    return record;
  }

  @Transaction()
  public async RevokeCredential(
    ctx: Context,
    credentialId: string,
    reason: string,
  ): Promise<CredentialAnchorRecord> {
    this.assertWriter(ctx);
    const id = requireCredentialId(credentialId);
    const revocationReason = requireReason(reason);

    const record = await this.readRecord(ctx, id);
    if (record.status === 'revoked') {
      throw new Error(`credential ${id} is already revoked`);
    }

    const revoked: CredentialAnchorRecord = {
      ...record,
      status: 'revoked',
      revokedAt: timestampToIso(ctx.stub.getTxTimestamp() as TxTimestampLike),
      revocationReason,
    };

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(revoked), 'utf8'));
    ctx.stub.setEvent(EVENT_REVOKED, Buffer.from(JSON.stringify({
      credentialId: id,
      hash: record.hash,
      status: revoked.status,
      revokedAt: revoked.revokedAt,
      revocationReason,
    }), 'utf8'));

    return revoked;
  }

  @Transaction(false)
  @Returns('CredentialAnchorRecord')
  public async GetCredential(
    ctx: Context,
    credentialId: string,
  ): Promise<CredentialAnchorRecord> {
    const id = requireCredentialId(credentialId);
    return this.readRecord(ctx, id);
  }

  @Transaction(false)
  @Returns('VerifyCredentialResult')
  public async VerifyCredential(
    ctx: Context,
    credentialId: string,
    hash: string,
  ): Promise<VerifyCredentialResult> {
    const id = requireCredentialId(credentialId);
    const digest = requireSha256(hash);
    const bytes = await ctx.stub.getState(id);
    if (!bytes || bytes.length === 0) {
      return { exists: false, hashMatches: false, status: '' };
    }
    const record = parseRecord(bytes);
    return {
      exists: true,
      hashMatches: record.hash === digest,
      status: record.status,
    };
  }

  @Transaction(false)
  @Returns('HistoryEntry[]')
  public async GetHistory(
    ctx: Context,
    credentialId: string,
  ): Promise<HistoryEntry[]> {
    const id = requireCredentialId(credentialId);
    const iterator = await ctx.stub.getHistoryForKey(id);
    const history: HistoryEntry[] = [];

    try {
      let result = await iterator.next();
      while (!result.done) {
        const modification = result.value;
        if (!modification) {
          break;
        }
        const valueBytes = modification.value;
        let record: CredentialAnchorRecord | null = null;
        if (valueBytes && valueBytes.length > 0) {
          try {
            record = parseRecord(valueBytes);
          } catch {
            record = null;
          }
        }
        if (history.length >= HISTORY_LIMIT) {
          break;
        }
        history.push({
          txId: typeof modification.txId === 'string' ? modification.txId : '',
          timestamp: timestampToIso(modification.timestamp as TxTimestampLike),
          isDelete: Boolean(modification.isDelete),
          record,
        });
        result = await iterator.next();
      }
    } finally {
      await iterator.close();
    }

    return history;
  }

  private assertWriter(ctx: Context): void {
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== ISSUER_MSP_ID) {
      throw new Error(
        `MSP ${mspId} is not authorised; issuer MSP is ${ISSUER_MSP_ID}`,
      );
    }
    const cn = enrollmentCn(ctx.clientIdentity.getID());
    const role = ctx.clientIdentity.getAttributeValue('sijil.role');
    if (cn !== APP_WRITER_CN && role !== 'anchor') {
      throw new Error(
        `enrollment ${cn || 'unknown'} is not authorised to write; writer CN is ${APP_WRITER_CN}`,
      );
    }
  }

  private async readRecord(
    ctx: Context,
    credentialId: string,
  ): Promise<CredentialAnchorRecord> {
    const bytes = await ctx.stub.getState(credentialId);
    if (!bytes || bytes.length === 0) {
      throw new Error(`credential ${credentialId} is not anchored`);
    }
    return parseRecord(bytes);
  }
}

function requireCredentialId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!UUID_TEXT.test(trimmed)) {
    throw new Error('credentialId must be a UUID');
  }
  return trimmed;
}

function requireSha256(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!SHA256_HEX.test(trimmed)) {
    throw new Error('hash must be a SHA-256 hex digest');
  }
  return trimmed;
}

function requireDid(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('did:') || trimmed.length < 8 || trimmed.length > 512 || /\s/.test(trimmed)) {
    throw new Error(`${field} must be a DID`);
  }
  return trimmed;
}

function requireIssuedAt(value: string): string {
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error('issuedAt must be an ISO-8601 timestamp');
  }
  return new Date(parsed).toISOString();
}

function requireReason(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 280 || /[\u0000-\u001f]/.test(trimmed)) {
    throw new Error('reason is required and must be at most 280 characters');
  }
  return trimmed;
}

function enrollmentCn(clientId: string): string {
  const match = /CN=([^,:/]+)/.exec(clientId);
  return match?.[1]?.trim() ?? '';
}

function parseRecord(bytes: Uint8Array): CredentialAnchorRecord {
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!isRecord(parsed)) {
    throw new Error('stored credential record is malformed');
  }
  return parsed;
}

function isRecord(value: unknown): value is CredentialAnchorRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.credentialId === 'string' &&
    typeof rec.hash === 'string' &&
    typeof rec.issuerDid === 'string' &&
    typeof rec.holderDid === 'string' &&
    typeof rec.issuedAt === 'string' &&
    (rec.status === 'active' || rec.status === 'revoked') &&
    typeof rec.revokedAt === 'string' &&
    typeof rec.revocationReason === 'string'
  );
}

function timestampToIso(ts: TxTimestampLike | undefined): string {
  if (!ts) {
    return new Date(0).toISOString();
  }
  const seconds = asSeconds(ts.seconds);
  const nanos = typeof ts.nanos === 'number' ? ts.nanos : 0;
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

function asSeconds(value: TxTimestampLike['seconds']): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    if (typeof value.toNumber === 'function') {
      return value.toNumber();
    }
    if (typeof value.low === 'number') {
      return value.low;
    }
  }
  return 0;
}

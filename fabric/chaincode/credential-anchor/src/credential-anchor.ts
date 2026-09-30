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
    this.assertIssuerMsp(ctx);
    const id = requireNonEmpty(credentialId, 'credentialId');
    const digest = requireNonEmpty(hash, 'hash');
    const issuer = requireNonEmpty(issuerDid, 'issuerDid');
    const holder = requireNonEmpty(holderDid, 'holderDid');
    const issued = requireNonEmpty(issuedAt, 'issuedAt');

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
    this.assertIssuerMsp(ctx);
    const id = requireNonEmpty(credentialId, 'credentialId');
    const revocationReason = requireNonEmpty(reason, 'reason');

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
    const id = requireNonEmpty(credentialId, 'credentialId');
    return this.readRecord(ctx, id);
  }

  @Transaction(false)
  @Returns('VerifyCredentialResult')
  public async VerifyCredential(
    ctx: Context,
    credentialId: string,
    hash: string,
  ): Promise<VerifyCredentialResult> {
    const id = requireNonEmpty(credentialId, 'credentialId');
    const digest = requireNonEmpty(hash, 'hash');
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
    const id = requireNonEmpty(credentialId, 'credentialId');
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
        const record =
          valueBytes && valueBytes.length > 0 ? parseRecord(valueBytes) : null;
        history.push({
          txId: modification.txId,
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

  private assertIssuerMsp(ctx: Context): void {
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== ISSUER_MSP_ID) {
      throw new Error(
        `MSP ${mspId} is not authorised; issuer MSP is ${ISSUER_MSP_ID}`,
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

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
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

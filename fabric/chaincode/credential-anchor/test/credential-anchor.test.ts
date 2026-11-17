import type { Context } from 'fabric-contract-api';
import { APP_WRITER_CN, CredentialAnchor, ISSUER_MSP_ID } from '../src/credential-anchor';
import type { CredentialAnchorRecord } from '../src/types';

const CREDENTIAL_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const ISSUER_DID = 'did:sijil:issuer:org1';
const HOLDER_DID = 'did:sijil:holder:learner-1';
const ISSUED_AT = '2026-09-30T00:00:00.000Z';
const TX_SECONDS = 1_720_000_000;

type LedgerMap = Map<string, Uint8Array>;

interface HistoryMod {
  txId: string;
  timestamp: { seconds: number; nanos: number };
  isDelete: boolean;
  value: Uint8Array;
}

function utf8(value: string): Uint8Array {
  return Buffer.from(value, 'utf8');
}

function emptyState(): Uint8Array {
  return new Uint8Array(0);
}

function makeCtx(options: {
  mspId?: string;
  enrollmentCn?: string;
  ledger?: LedgerMap;
}): Context {
  const ledger = options.ledger ?? new Map<string, Uint8Array>();
  const mspId = options.mspId ?? ISSUER_MSP_ID;
  const enrollmentCn = options.enrollmentCn ?? APP_WRITER_CN;

  const stub = {
    getState: jest.fn(async (key: string): Promise<Uint8Array> => {
      return ledger.get(key) ?? emptyState();
    }),
    putState: jest.fn(async (key: string, value: Uint8Array): Promise<void> => {
      ledger.set(key, Buffer.from(value));
    }),
    setEvent: jest.fn(),
    getTxTimestamp: jest.fn(() => ({ seconds: TX_SECONDS, nanos: 0 })),
    getHistoryForKey: jest.fn(async (key: string) => {
      const bytes = ledger.get(key);
      const mods: HistoryMod[] = bytes
        ? [
            {
              txId: 'tx-anchor',
              timestamp: { seconds: TX_SECONDS, nanos: 0 },
              isDelete: false,
              value: bytes,
            },
          ]
        : [];
      let index = 0;
      return {
        next: async () => {
          if (index >= mods.length) {
            return { done: true, value: undefined };
          }
          const value = mods[index];
          index += 1;
          return { done: false, value };
        },
        close: async () => undefined,
      };
    }),
  };

  const clientIdentity = {
    getMSPID: jest.fn(() => mspId),
    getID: jest.fn(() => `x509::CN=${enrollmentCn},OU=client::CN=ca.org1.example.com`),
    getAttributeValue: jest.fn(() => ''),
  };

  return { stub, clientIdentity } as unknown as Context;
}

describe('CredentialAnchor', () => {
  const contract = new CredentialAnchor();

  test('anchors a credential under the issuer MSP', async () => {
    const ledger: LedgerMap = new Map();
    const ctx = makeCtx({ ledger });

    const record = await contract.AnchorCredential(
      ctx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    expect(record).toEqual<CredentialAnchorRecord>({
      credentialId: CREDENTIAL_ID,
      hash: HASH,
      issuerDid: ISSUER_DID,
      holderDid: HOLDER_DID,
      issuedAt: ISSUED_AT,
      status: 'active',
      revokedAt: '',
      revocationReason: '',
    });
    expect(ledger.get(CREDENTIAL_ID)?.length).toBeGreaterThan(0);
    expect(ctx.stub.setEvent).toHaveBeenCalledWith(
      'CredentialAnchored',
      expect.any(Uint8Array),
    );
  });

  test('rejects a duplicate anchor (immutable key)', async () => {
    const ledger: LedgerMap = new Map();
    const ctx = makeCtx({ ledger });

    await contract.AnchorCredential(
      ctx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    await expect(
      contract.AnchorCredential(
        ctx,
        CREDENTIAL_ID,
        OTHER_HASH,
        ISSUER_DID,
        HOLDER_DID,
        ISSUED_AT,
      ),
    ).rejects.toThrow(/already anchored/);
  });

  test('revokes without overwriting the anchored hash', async () => {
    const ledger: LedgerMap = new Map();
    const ctx = makeCtx({ ledger });

    await contract.AnchorCredential(
      ctx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    const revoked = await contract.RevokeCredential(
      ctx,
      CREDENTIAL_ID,
      'holder-request',
    );

    expect(revoked.status).toBe('revoked');
    expect(revoked.hash).toBe(HASH);
    expect(revoked.revocationReason).toBe('holder-request');
    expect(revoked.revokedAt).toBe(new Date(TX_SECONDS * 1000).toISOString());
    expect(ctx.stub.setEvent).toHaveBeenCalledWith(
      'CredentialRevoked',
      expect.any(Uint8Array),
    );

    const stored = await contract.GetCredential(ctx, CREDENTIAL_ID);
    expect(stored.hash).toBe(HASH);
    expect(stored.status).toBe('revoked');
  });

  test('verify matches the anchored hash', async () => {
    const ledger: LedgerMap = new Map();
    const ctx = makeCtx({ ledger });

    await contract.AnchorCredential(
      ctx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    await expect(
      contract.VerifyCredential(ctx, CREDENTIAL_ID, HASH),
    ).resolves.toEqual({
      exists: true,
      hashMatches: true,
      status: 'active',
    });
  });

  test('verify reports a hash mismatch', async () => {
    const ledger: LedgerMap = new Map();
    const ctx = makeCtx({ ledger });

    await contract.AnchorCredential(
      ctx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    await expect(
      contract.VerifyCredential(ctx, CREDENTIAL_ID, OTHER_HASH),
    ).resolves.toEqual({
      exists: true,
      hashMatches: false,
      status: 'active',
    });
  });

  test('rejects Anchor and Revoke from a non-issuer MSP', async () => {
    const ledger: LedgerMap = new Map();
    const issuerCtx = makeCtx({ ledger, mspId: ISSUER_MSP_ID });
    await contract.AnchorCredential(
      issuerCtx,
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );

    const org2Ctx = makeCtx({ ledger, mspId: 'Org2MSP' });

    await expect(
      contract.AnchorCredential(
        org2Ctx,
        OTHER_ID,
        HASH,
        ISSUER_DID,
        HOLDER_DID,
        ISSUED_AT,
      ),
    ).rejects.toThrow(/not authorised/);

    await expect(
      contract.RevokeCredential(org2Ctx, CREDENTIAL_ID, 'unauthorised'),
    ).rejects.toThrow(/not authorised/);
  });

  test('rejects Org1 admin and malformed writes', async () => {
    const ledger: LedgerMap = new Map();
    const admin = makeCtx({ ledger, enrollmentCn: 'Admin@org1.example.com' });
    await expect(
      contract.AnchorCredential(admin, CREDENTIAL_ID, HASH, ISSUER_DID, HOLDER_DID, ISSUED_AT),
    ).rejects.toThrow(/not authorised to write/);

    const writer = makeCtx({ ledger });
    await expect(
      contract.AnchorCredential(writer, 'cred-001', HASH, ISSUER_DID, HOLDER_DID, ISSUED_AT),
    ).rejects.toThrow(/UUID/);
    await expect(
      contract.AnchorCredential(writer, CREDENTIAL_ID, 'sha256:not-a-digest', ISSUER_DID, HOLDER_DID, ISSUED_AT),
    ).rejects.toThrow(/SHA-256/);
    await expect(
      contract.AnchorCredential(writer, CREDENTIAL_ID, HASH, 'issuer', HOLDER_DID, ISSUED_AT),
    ).rejects.toThrow(/DID/);
    await expect(
      contract.AnchorCredential(writer, CREDENTIAL_ID, HASH, ISSUER_DID, HOLDER_DID, 'yesterday'),
    ).rejects.toThrow(/ISO-8601/);
  });

  test('Org2 may read history but cannot write', async () => {
    const ledger: LedgerMap = new Map();
    await contract.AnchorCredential(
      makeCtx({ ledger }),
      CREDENTIAL_ID,
      HASH,
      ISSUER_DID,
      HOLDER_DID,
      ISSUED_AT,
    );
    const reader = makeCtx({ ledger, mspId: 'Org2MSP', enrollmentCn: 'reader' });
    const verified = await contract.VerifyCredential(reader, CREDENTIAL_ID, HASH);
    expect(verified.hashMatches).toBe(true);
    const history = await contract.GetHistory(reader, CREDENTIAL_ID);
    expect(history.length).toBe(1);
    expect(history[0].record?.hash).toBe(HASH);
  });
});

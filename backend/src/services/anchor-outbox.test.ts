import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processAnchorBatch, type AnchorOutboxStore, type OutboxCredential } from "./anchor-outbox";
import { LedgerPermanentError } from "./ledger.errors";
import type { AnchorCredentialInput, AnchorResult, LedgerHistoryEntry, LedgerPort, VerifyCredentialResult } from "./ledger.types";

const HASH = "aa".repeat(32);
const OTHER_HASH = "bb".repeat(32);
const NOW = new Date("2026-09-30T12:00:00.000Z");

function sampleRow(overrides: Partial<OutboxCredential> = {}): OutboxCredential {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    credentialHash: HASH,
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6Mkholder",
    issuedAt: "2026-09-30T00:00:00.000Z",
    anchorStatus: "pending",
    anchorAttempts: 0,
    updatedAt: "2026-09-30T11:00:00.000Z",
    createdAt: "2026-09-30T10:00:00.000Z",
    anchorTxId: null,
    ...overrides,
  };
}

function memoryStore(seed: OutboxCredential[]): AnchorOutboxStore {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));

  return {
    async listCandidates(limit, maxAttempts) {
      return [...rows.values()]
        .filter((row) => (row.anchorStatus === "pending" || row.anchorStatus === "failed") && row.anchorAttempts < maxAttempts)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },
    async markAnchored(id, txId, anchoredAt) {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, {
        ...current,
        anchorStatus: "anchored",
        anchorTxId: txId,
        updatedAt: anchoredAt,
      });
    },
    async markFailed(id, attempts, _error, at) {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, {
        ...current,
        anchorStatus: "failed",
        anchorAttempts: attempts,
        updatedAt: at,
      });
    },
    async getByIdOrUri(idOrUri) {
      return rows.get(idOrUri) ?? null;
    },
    async resetForRetry(id, at) {
      const current = rows.get(id);
      if (!current) throw new Error("missing");
      const next = { ...current, anchorStatus: "pending", anchorAttempts: 0, updatedAt: at };
      rows.set(id, next);
      return next;
    },
    async countByStatus(status) {
      return [...rows.values()].filter((row) => row.anchorStatus === status).length;
    },
    async listRevokeCandidates(limit, maxAttempts) {
      return [...rows.values()]
        .filter((row) => (row.revokeStatus === "pending" || row.revokeStatus === "failed") && (row.revokeAttempts ?? 0) < maxAttempts)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },
    async markRevokeSucceeded(id, txId, at) {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, { ...current, revokeStatus: "revoked", anchorTxId: txId, updatedAt: at });
    },
    async markRevokeFailed(id, attempts, _error, at) {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, { ...current, revokeStatus: "failed", revokeAttempts: attempts, updatedAt: at });
    },
  };
}

function mockLedger(overrides: Partial<LedgerPort> & { enabled?: boolean } = {}): LedgerPort {
  const enabled = overrides.enabled ?? true;
  return {
    isEnabled: () => enabled,
    isReachable: async () => enabled,
    anchorCredential: async () => ({ txId: "tx-success" }),
    revokeCredential: async () => ({ txId: "tx-revoke" }),
    verifyCredential: async () => ({ exists: true, hashMatches: true, status: "active" }),
    getHistory: async () => [],
    close: () => undefined,
    ...overrides,
  };
}

const baseOptions = {
  batchSize: 10,
  maxAttempts: 3,
  backoffBaseMs: 0,
  now: () => NOW,
};

describe("anchor outbox worker", () => {
  it("anchors a pending credential on success", async () => {
    const store = memoryStore([sampleRow()]);
    const result = await processAnchorBatch({ ...baseOptions, ledger: mockLedger(), store });
    assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    const row = await store.getByIdOrUri(sampleRow().id);
    assert.equal(row?.anchorStatus, "anchored");
    assert.equal(row?.anchorTxId, "tx-success");
  });

  it("retries after a transient failure", async () => {
    const store = memoryStore([sampleRow()]);
    let calls = 0;
    const ledger = mockLedger({
      async anchorCredential(_input: AnchorCredentialInput): Promise<AnchorResult> {
        calls += 1;
        if (calls === 1) {
          throw new Error("14 UNAVAILABLE: peer connection reset");
        }
        return { txId: "tx-retry" };
      },
    });

    const first = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.equal(first.failed, 1);
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorStatus, "failed");
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorAttempts, 1);

    const second = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.equal(second.succeeded, 1);
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorStatus, "anchored");
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorTxId, "tx-retry");
    assert.equal(calls, 2);
  });

  it("stops retrying after a permanent failure", async () => {
    const store = memoryStore([sampleRow()]);
    const ledger = mockLedger({
      async anchorCredential(): Promise<AnchorResult> {
        throw new LedgerPermanentError("hash mismatch on ledger");
      },
    });

    const first = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.equal(first.failed, 1);
    const after = await store.getByIdOrUri(sampleRow().id);
    assert.equal(after?.anchorStatus, "failed");
    assert.equal(after?.anchorAttempts, 3);

    const second = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.equal(second.processed, 0);
  });

  it("treats an already-anchored same hash as success", async () => {
    const store = memoryStore([sampleRow()]);
    const ledger = mockLedger({
      async anchorCredential(): Promise<AnchorResult> {
        throw new Error("credential 22222222-2222-2222-2222-222222222222 is already anchored (immutable)");
      },
      async verifyCredential(_id: string, hash: string): Promise<VerifyCredentialResult> {
        return { exists: true, hashMatches: hash === HASH, status: "active" };
      },
      async getHistory(): Promise<LedgerHistoryEntry[]> {
        return [];
      },
    });

    const result = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.equal(result.succeeded, 1);
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorStatus, "anchored");
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorTxId, "already-anchored");
  });

  it("no-ops when the ledger is disabled", async () => {
    const store = memoryStore([sampleRow({ credentialHash: OTHER_HASH })]);
    let anchored = 0;
    const ledger = mockLedger({
      enabled: false,
      async anchorCredential(): Promise<AnchorResult> {
        anchored += 1;
        return { txId: "should-not-run" };
      },
    });

    const result = await processAnchorBatch({ ...baseOptions, ledger, store });
    assert.deepEqual(result, { processed: 0, succeeded: 0, failed: 0, skipped: 0 });
    assert.equal(anchored, 0);
    assert.equal((await store.getByIdOrUri(sampleRow().id))?.anchorStatus, "pending");
  });
});

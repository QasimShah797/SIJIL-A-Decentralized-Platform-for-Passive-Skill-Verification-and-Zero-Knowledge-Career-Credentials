/**
 * In-memory lifecycle. This does not submit to the running Fabric network
 * and does not touch hosted Supabase. A live network run stays blocked
 * while FABRIC_ENABLED is false.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { evaluateCredentialVerification } from "./credential-verify";
import { processAnchorBatch, processRevokeBatch, type AnchorOutboxStore, type OutboxCredential } from "./anchor-outbox";
import type { LedgerHistoryEntry, LedgerPort } from "./ledger.types";

const ID = "33333333-3333-4333-8333-333333333333";
const keys = generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const built = buildCredentialDocument({
  credentialUri: "urn:uuid:sijil:lifecycle",
  issuerDid: "did:web:issuer.sijil.edu.pk",
  holderDid: "did:key:z6Mklifecycle",
  skill: "TypeScript",
  evidenceCount: 1,
  evidenceHashes: ["ab".repeat(32)],
  validFrom: "2026-11-15T00:00:00.000Z",
});
const proof = signSha256Hash(built.sha256Hash, privatePem);

function memoryLedger(): LedgerPort & { history: LedgerHistoryEntry[] } {
  const records = new Map<string, { hash: string; status: "active" | "revoked" }>();
  const history: LedgerHistoryEntry[] = [];
  return {
    history,
    isEnabled: () => true,
    isReachable: async () => true,
    async anchorCredential(input) {
      const existing = records.get(input.credentialId);
      if (existing) {
        throw new Error(`credential ${input.credentialId} is already anchored (immutable)`);
      }
      records.set(input.credentialId, { hash: input.hash, status: "active" });
      history.push({
        txId: "tx-anchor",
        timestamp: "2026-11-15T00:01:00.000Z",
        isDelete: false,
        record: {
          credentialId: input.credentialId,
          hash: input.hash,
          issuerDid: input.issuerDid,
          holderDid: input.holderDid,
          issuedAt: input.issuedAt,
          status: "active",
          revokedAt: "",
          revocationReason: "",
        },
      });
      return { txId: "tx-anchor" };
    },
    async revokeCredential(id, reason) {
      const existing = records.get(id);
      if (!existing) throw new Error("not anchored");
      if (existing.status === "revoked") throw new Error("already revoked");
      existing.status = "revoked";
      history.push({
        txId: "tx-revoke",
        timestamp: "2026-11-15T00:02:00.000Z",
        isDelete: false,
        record: {
          credentialId: id,
          hash: existing.hash,
          issuerDid: "did:web:issuer.sijil.edu.pk",
          holderDid: "did:key:z6Mklifecycle",
          issuedAt: "2026-11-15T00:00:00.000Z",
          status: "revoked",
          revokedAt: "2026-11-15T00:02:00.000Z",
          revocationReason: reason,
        },
      });
      return { txId: "tx-revoke" };
    },
    async verifyCredential(id, hash) {
      const existing = records.get(id);
      if (!existing) return { exists: false, hashMatches: false, status: "" };
      return { exists: true, hashMatches: existing.hash === hash, status: existing.status };
    },
    async getHistory() {
      return history;
    },
    close() {},
  };
}

function storeFor(row: OutboxCredential): AnchorOutboxStore & { row: () => OutboxCredential } {
  let current = { ...row };
  const claims = new Set<string>();
  return {
    row: () => current,
    async listCandidates() {
      return current.anchorStatus === "pending" || current.anchorStatus === "failed" ? [current] : [];
    },
    async markAnchored(id, txId, at) {
      current = { ...current, id, anchorStatus: "anchored", anchorTxId: txId, updatedAt: at, claimToken: null };
    },
    async markFailed(id, attempts, _error, at) {
      current = { ...current, id, anchorStatus: "failed", anchorAttempts: attempts, updatedAt: at };
    },
    async getByIdOrUri() {
      return current;
    },
    async resetForRetry(id, at) {
      current = { ...current, id, anchorStatus: "pending", anchorAttempts: 0, updatedAt: at };
      return current;
    },
    async countByStatus(status) {
      return current.anchorStatus === status ? 1 : 0;
    },
    async listRevokeCandidates() {
      return current.revokeStatus === "pending" ? [current] : [];
    },
    async markRevokeSucceeded(_id, txId, at) {
      current = { ...current, revokeStatus: "revoked", anchorTxId: current.anchorTxId ?? txId, updatedAt: at };
    },
    async markRevokeFailed(_id, attempts, _error, at) {
      current = { ...current, revokeStatus: "failed", revokeAttempts: attempts, updatedAt: at };
    },
    async claimAnchor(id, token) {
      if (claims.has(id)) return null;
      claims.add(id);
      current = { ...current, claimToken: token };
      return current;
    },
    async markAnchorSuppressed(id, at) {
      current = { ...current, id, anchorStatus: "not_required", updatedAt: at };
    },
  };
}

describe("credential ledger lifecycle (isolated)", () => {
  it("anchors, verifies, then revokes without calling a live network", async () => {
    const ledger = memoryLedger();
    const store = storeFor({
      id: ID,
      credentialHash: built.sha256Hash,
      issuerDid: "did:web:issuer.sijil.edu.pk",
      holderDid: "did:key:z6Mklifecycle",
      issuedAt: "2026-11-15T00:00:00.000Z",
      anchorStatus: "pending",
      anchorAttempts: 0,
      updatedAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
      revokeStatus: "not_required",
    });
    const anchored = await processAnchorBatch({
      ledger,
      store,
      batchSize: 5,
      maxAttempts: 3,
      backoffBaseMs: 0,
    });
    assert.equal(anchored.succeeded, 1);
    assert.equal(store.row().anchorTxId, "tx-anchor");

    const verified = await evaluateCredentialVerification({
      found: true,
      credentialId: ID,
      storedHash: built.sha256Hash,
      storedDocument: built.document,
      proofValue: proof,
      revokedAt: null,
      anchorStatus: "anchored",
      anchorTxId: "tx-anchor",
      anchoredAt: "2026-11-15T00:01:00.000Z",
      holderDid: "did:key:z6Mklifecycle",
      issuerDid: "did:web:issuer.sijil.edu.pk",
    }, {
      ledger,
      verifySignature: (hash, value) => verifySha256Hash(hash, value, publicPem),
    });
    assert.equal(verified.status, "verified");
    assert.equal(verified.reason, "valid");
    assert.equal(verified.checks.anchor, "match");
    assert.equal(verified.checks.zkp, "not_applicable");

    store.row().revokeStatus = "pending";
    const revoked = await processRevokeBatch({
      ledger,
      store,
      batchSize: 5,
      maxAttempts: 3,
      backoffBaseMs: 0,
      revocationSubmit: true,
    });
    assert.equal(revoked.succeeded, 1);
    const after = await ledger.verifyCredential(ID, built.sha256Hash);
    assert.equal(after.status, "revoked");
    assert.equal((await ledger.getHistory(ID)).length, 2);
  });

  it("does not submit while the queue is held", async () => {
    const ledger = memoryLedger();
    let submits = 0;
    ledger.anchorCredential = async () => {
      submits += 1;
      return { txId: "nope" };
    };
    const store = storeFor({
      id: ID,
      credentialHash: built.sha256Hash,
      issuerDid: "did:web:issuer.sijil.edu.pk",
      holderDid: "did:key:z6Mklifecycle",
      issuedAt: "2026-11-15T00:00:00.000Z",
      anchorStatus: "pending",
      anchorAttempts: 0,
      updatedAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-11-14T00:00:00.000Z",
    });
    const held = await processAnchorBatch({
      ledger,
      store,
      batchSize: 5,
      maxAttempts: 3,
      backoffBaseMs: 0,
      queueHeld: true,
    });
    assert.equal(held.processed, 0);
    assert.equal(submits, 0);
  });

  it("lets only one worker claim a credential", async () => {
    const row: OutboxCredential = {
      id: ID,
      credentialHash: built.sha256Hash,
      issuerDid: "did:web:issuer.sijil.edu.pk",
      holderDid: "did:key:z6Mklifecycle",
      issuedAt: "2026-11-15T00:00:00.000Z",
      anchorStatus: "pending",
      anchorAttempts: 0,
      updatedAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
    };
    const backing = storeFor(row);
    const first = await backing.claimAnchor!(ID, "claim-1", "2099-01-01T00:00:00.000Z");
    const second = await backing.claimAnchor!(ID, "claim-2", "2099-01-01T00:00:00.000Z");
    assert.equal(first?.claimToken, "claim-1");
    assert.equal(second, null);
  });

  it("records revocation before anchoring without a chain revoke", async () => {
    const ledger = memoryLedger();
    let revokes = 0;
    ledger.revokeCredential = async () => {
      revokes += 1;
      return { txId: "should-not" };
    };
    const store = storeFor({
      id: ID,
      credentialHash: built.sha256Hash,
      issuerDid: "did:web:issuer.sijil.edu.pk",
      holderDid: "did:key:z6Mklifecycle",
      issuedAt: "2026-11-15T00:00:00.000Z",
      anchorStatus: "pending",
      anchorAttempts: 0,
      updatedAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
      revokeStatus: "pending",
      revocationReason: "holder request",
    });
    const result = await processRevokeBatch({
      ledger,
      store,
      batchSize: 5,
      maxAttempts: 3,
      backoffBaseMs: 0,
      revocationSubmit: true,
    });
    assert.equal(result.succeeded, 1);
    assert.equal(revokes, 0);
    assert.equal(store.row().anchorStatus, "not_required");
    assert.equal(store.row().revokeStatus, "revoked");
  });
});

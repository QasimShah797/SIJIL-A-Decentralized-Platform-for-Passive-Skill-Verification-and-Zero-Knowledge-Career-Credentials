import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  previewReconciliation,
  reconcileCredentialAnchor,
  ReconcileInProgressError,
  type ReconcileCredential,
  type ReconcileAuditInput,
  type ReconcileStore,
} from "./anchor-reconciliation.service";
import type { LedgerPort, VerifyCredentialResult } from "./ledger.types";
import { AppError } from "../utils/AppError";
import {
  clearWalletLedgerStatusCacheForTests,
  resolveWalletLedgerAnchorStatus,
} from "./wallet-ledger-status";
import credentialsRoutes from "../routes/credentials.routes";
import { requireAdmin, requireLearner } from "../middleware/role.middleware";
import { authMiddleware } from "../middleware/auth.middleware";

type RouteLayer = {
  handle: Function;
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
};

function routeHandles(method: string, path: string): Function[] {
  const layer = (credentialsRoutes as unknown as { stack: RouteLayer[] }).stack
    .find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer?.route, `${method} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASH = "aa".repeat(32);
const OTHER = "bb".repeat(32);

function credential(overrides: Partial<ReconcileCredential> = {}): ReconcileCredential {
  return {
    id: ID,
    credentialHash: HASH,
    anchorStatus: "anchored",
    anchorTxId: "old-tx",
    anchoredAt: "2026-10-16T18:32:58.000Z",
    revokedAt: null,
    revokeStatus: "not_required",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6Mk",
    issuedAt: "2026-10-16T18:12:36.000Z",
    ...overrides,
  };
}

function ledgerStub(
  result: VerifyCredentialResult | (() => Promise<VerifyCredentialResult>),
  options: { enabled?: boolean; failVerify?: boolean; submit?: () => Promise<{ txId: string }> } = {},
): LedgerPort {
  return {
    isEnabled: () => options.enabled !== false,
    isReachable: async () => options.enabled !== false,
    anchorCredential: options.submit ?? (async () => ({ txId: "new-tx" })),
    revokeCredential: async () => ({ txId: "rv" }),
    verifyCredential: async () => {
      if (options.failVerify) throw new Error("connect ECONNREFUSED 127.0.0.1:7051");
      return typeof result === "function" ? result() : result;
    },
    getHistory: async () => [],
    close: () => undefined,
  };
}

function memoryStore(row: ReconcileCredential, options: { refuseSecondInProgress?: boolean } = {}) {
  const audits: Array<ReconcileAuditInput & { id: string; completed?: string; newTx?: string; error?: string }> = [];
  let current = { ...row };
  let inProgress = false;
  const store: ReconcileStore = {
    async getCredential() {
      return { ...current };
    },
    async recordAudit(input) {
      if (input.outcome === "in_progress") {
        if (inProgress) throw new ReconcileInProgressError("in progress");
        inProgress = true;
      }
      const id = `audit-${audits.length + 1}`;
      audits.push({ ...input, id });
      return id;
    },
    async completeAudit(auditId, outcome, detail) {
      const row = audits.find((item) => item.id === auditId);
      if (row) {
        row.outcome = outcome;
        row.completed = "done";
        row.newTx = detail.newAnchorTxId;
        row.error = detail.error;
      }
      inProgress = false;
    },
    async replaceAnchorTx(id, previousTxId, newTxId) {
      if (current.id !== id || current.anchorTxId !== previousTxId || current.anchorStatus !== "anchored") {
        return false;
      }
      current = { ...current, anchorTxId: newTxId };
      return true;
    },
  };
  return { store, audits, getCurrent: () => current, setInProgress: () => { inProgress = options.refuseSecondInProgress !== false; } };
}

const request = { credentialId: ID, expectedHash: HASH, reason: "Admin-approved Dart ledger gap", requestedBy: "admin-1" };

describe("anchor reconciliation", () => {
  it("matches an existing ledger anchor and does not submit", async () => {
    let submitted = 0;
    const { store, audits } = memoryStore(credential());
    const result = await reconcileCredentialAnchor(request, {
      store,
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }, {
        submit: async () => {
          submitted += 1;
          return { txId: "should-not" };
        },
      }),
    });
    assert.equal(result.outcome, "already_on_ledger");
    assert.equal(result.previousAnchorTxId, "old-tx");
    assert.equal(submitted, 0);
    assert.equal(audits[0]?.outcome, "already_on_ledger");
    assert.equal(audits[0]?.previousAnchorTxId, "old-tx");
  });

  it("anchors a missing credential and preserves the previous transaction ID in audit", async () => {
    const { store, audits, getCurrent } = memoryStore(credential());
    const result = await reconcileCredentialAnchor(request, {
      store,
      ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }),
    });
    assert.equal(result.outcome, "reconciled");
    assert.equal(result.previousAnchorTxId, "old-tx");
    assert.equal(result.anchorTxId, "new-tx");
    assert.equal(getCurrent().anchorTxId, "new-tx");
    const started = audits.find((item) => item.id === result.auditId);
    assert.equal(started?.previousAnchorTxId, "old-tx");
    assert.equal(started?.previousAnchoredAt, "2026-10-16T18:32:58.000Z");
    assert.equal(started?.reason, request.reason);
    assert.equal(audits.at(-1)?.outcome, "completed");
    assert.equal(audits.at(-1)?.newTx, "new-tx");
  });

  it("refuses a conflicting ledger hash and does not submit", async () => {
    let submitted = 0;
    const { store, audits } = memoryStore(credential());
    await assert.rejects(
      () => reconcileCredentialAnchor(request, {
        store,
        ledger: ledgerStub({ exists: true, hashMatches: false, status: "active" }, {
          submit: async () => {
            submitted += 1;
            return { txId: "x" };
          },
        }),
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409 && /different hash/i.test(error.message),
    );
    assert.equal(submitted, 0);
    assert.equal(audits[0]?.outcome, "refused_conflicting_hash");
  });

  it("refuses revoked credentials", async () => {
    const { store, audits } = memoryStore(credential({ revokedAt: "2026-10-16T10:27:00.000Z", revokeStatus: "revoked" }));
    await assert.rejects(
      () => reconcileCredentialAnchor(request, { store, ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }) }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409 && /Revoked/i.test(error.message),
    );
    assert.equal(audits[0]?.outcome, "refused_revoked");
  });

  it("treats Fabric errors as unavailable, not as absence", async () => {
    const { store, audits } = memoryStore(credential());
    await assert.rejects(
      () => reconcileCredentialAnchor(request, {
        store,
        ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }, { failVerify: true }),
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 503 && /unavailable/i.test(error.message),
    );
    assert.equal(audits.length, 0);
  });

  it("rejects a second concurrent reconciliation", async () => {
    const { store } = memoryStore(credential());
    let release!: () => void;
    const held = new Promise<VerifyCredentialResult>((resolve) => {
      release = () => resolve({ exists: false, hashMatches: false, status: "" });
    });
    const first = reconcileCredentialAnchor(request, { store, ledger: ledgerStub(() => held) });
    await assert.rejects(
      () => reconcileCredentialAnchor(request, { store, ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }) }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409 && /already in progress/i.test(error.message),
    );
    release();
    const result = await first;
    assert.equal(result.outcome, "reconciled");
  });

  it("refuses a mismatched admin hash confirmation", async () => {
    const { store, audits } = memoryStore(credential());
    await assert.rejects(
      () => reconcileCredentialAnchor({ ...request, expectedHash: OTHER }, {
        store,
        ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }),
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 409,
    );
    assert.equal(audits[0]?.outcome, "refused_hash_confirmation");
  });

  it("preview is read-only and reports the missing-anchor plan", async () => {
    const { store, audits } = memoryStore(credential());
    const plan = await previewReconciliation(ID, {
      store,
      ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }),
    });
    assert.deepEqual(plan, { action: "anchor_missing", ledgerExists: false });
    assert.equal(audits.length, 0);
  });

  it("admin routes require authentication and the admin role, not a learner", () => {
    for (const method of ["get", "post"]) {
      const route = routeHandles(method, "/:id/ledger-reconcile");
      assert.equal(route.includes(authMiddleware), true, `${method} auth`);
      assert.equal(route.includes(requireAdmin), true, `${method} admin`);
      assert.equal(route.includes(requireLearner), false);
    }
  });
});

describe("wallet ledger status", () => {
  it("reports pending and failed from the database without querying Fabric", async () => {
    let queried = 0;
    const ledger = ledgerStub({ exists: true, hashMatches: true, status: "active" });
    ledger.verifyCredential = async () => {
      queried += 1;
      return { exists: true, hashMatches: true, status: "active" };
    };
    assert.equal(await resolveWalletLedgerAnchorStatus({ id: ID, credential_hash: HASH, anchor_status: "pending" }, ledger), "pending");
    assert.equal(await resolveWalletLedgerAnchorStatus({ id: ID, credential_hash: HASH, anchor_status: "failed" }, ledger), "failed");
    assert.equal(queried, 0);
  });

  it("reports anchored only when the ledger hash matches", async () => {
    clearWalletLedgerStatusCacheForTests();
    assert.equal(
      await resolveWalletLedgerAnchorStatus(
        { id: ID, credential_hash: HASH, anchor_status: "anchored" },
        ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      ),
      "anchored",
    );
  });

  it("reports not_on_ledger when the database says anchored but Fabric has no entry", async () => {
    clearWalletLedgerStatusCacheForTests();
    assert.equal(
      await resolveWalletLedgerAnchorStatus(
        { id: `${ID.slice(0, -1)}b`, credential_hash: HASH, anchor_status: "anchored" },
        ledgerStub({ exists: false, hashMatches: false, status: "" }),
      ),
      "not_on_ledger",
    );
  });

  it("reports unavailable on network errors instead of not_on_ledger", async () => {
    clearWalletLedgerStatusCacheForTests();
    assert.equal(
      await resolveWalletLedgerAnchorStatus(
        { id: `${ID.slice(0, -1)}c`, credential_hash: HASH, anchor_status: "anchored" },
        ledgerStub({ exists: false, hashMatches: false, status: "" }, { failVerify: true }),
      ),
      "unavailable",
    );
  });
});

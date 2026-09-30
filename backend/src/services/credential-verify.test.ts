import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { evaluateCredentialVerification, credentialShowsVerified, type CredentialVerifySnapshot } from "./credential-verify";
import type { LedgerPort, VerifyCredentialResult } from "./ledger.types";

const sampleInput = {
  credentialUri: "urn:uuid:sijil:verify-cred",
  issuerDid: "did:web:issuer.cust.edu.pk",
  holderDid: "did:key:z6Mktest",
  skill: "TypeScript",
  evidenceCount: 3,
  validFrom: "2026-01-15T00:00:00.000Z",
};

const keys = generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

const canonical = buildCredentialDocument(sampleInput);
const proofValue = signSha256Hash(canonical.sha256Hash, privatePem);

function snapshot(overrides: Partial<CredentialVerifySnapshot> = {}): CredentialVerifySnapshot {
  return {
    found: true,
    credentialId: "33333333-3333-3333-3333-333333333333",
    storedHash: canonical.sha256Hash,
    storedDocument: canonical.document,
    proofValue,
    revokedAt: null,
    anchorStatus: "anchored",
    anchorTxId: "tx-anchor",
    anchoredAt: "2026-01-15T01:00:00.000Z",
    ...overrides,
  };
}

function ledgerStub(result: VerifyCredentialResult, enabled = true): LedgerPort {
  return {
    isEnabled: () => enabled,
    isReachable: async () => enabled,
    anchorCredential: async () => ({ txId: "tx" }),
    revokeCredential: async () => ({ txId: "tx" }),
    verifyCredential: async () => result,
    getHistory: async () => [],
    close: () => undefined,
  };
}

const depsBase = {
  verifySignature: (hashHex: string, value: string) => verifySha256Hash(hashHex, value, publicPem),
  now: () => new Date("2026-10-01T00:00:00.000Z"),
};

describe("public credential verification outcomes", () => {
  it("returns not_found when the credential is missing", async () => {
    const result = await evaluateCredentialVerification(null, {
      ...depsBase,
      ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }),
    });
    assert.equal(result.status, "not_found");
    assert.equal(result.hash, null);
  });

  it("returns tampered when the stored document is manually altered", async () => {
    const tampered = buildCredentialDocument({ ...sampleInput, skill: "Java" });
    const result = await evaluateCredentialVerification(
      snapshot({ storedDocument: tampered.document }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      },
    );
    assert.equal(result.status, "tampered");
  });

  it("returns tampered when the ledger hash does not match the recomputed hash", async () => {
    const result = await evaluateCredentialVerification(snapshot(), {
      ...depsBase,
      ledger: ledgerStub({ exists: true, hashMatches: false, status: "active" }),
    });
    assert.equal(result.status, "tampered");
  });

  it("returns revoked when Postgres has revoked_at", async () => {
    const result = await evaluateCredentialVerification(
      snapshot({ revokedAt: "2026-09-30T00:00:00.000Z" }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      },
    );
    assert.equal(result.status, "revoked");
  });

  it("returns revoked when the ledger status is revoked", async () => {
    const result = await evaluateCredentialVerification(snapshot(), {
      ...depsBase,
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "revoked" }),
    });
    assert.equal(result.status, "revoked");
  });

  it("returns pending_anchor when the credential is not on the ledger yet", async () => {
    const result = await evaluateCredentialVerification(
      snapshot({ anchorStatus: "pending", anchorTxId: null, anchoredAt: null }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: false, hashMatches: false, status: "" }),
      },
    );
    assert.equal(result.status, "pending_anchor");
  });

  it("returns ledger_unavailable when Fabric is disabled after a local anchor", async () => {
    const result = await evaluateCredentialVerification(snapshot(), {
      ...depsBase,
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }, false),
    });
    assert.equal(result.status, "ledger_unavailable");
  });

  it("returns verified when hash, signature, and ledger all agree", async () => {
    const result = await evaluateCredentialVerification(snapshot(), {
      ...depsBase,
      ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
    });
    assert.equal(result.status, "verified");
    assert.equal(result.hash, canonical.sha256Hash);
    assert.equal(result.credentialId, "33333333-3333-3333-3333-333333333333");
    assert.equal(result.anchorTxId, "tx-anchor");
  });

  it("returns tampered when a stored evidence hash no longer matches the file", async () => {
    const original = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const result = await evaluateCredentialVerification(
      snapshot({
        storedEvidenceHashes: [original],
        liveEvidenceHashes: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
        evidenceHashMismatch: true,
      }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      },
    );
    assert.equal(result.status, "tampered");
  });

  it("returns evidence_unavailable when storage cannot be read", async () => {
    const result = await evaluateCredentialVerification(
      snapshot({ evidenceUnavailable: true }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      },
    );
    assert.equal(result.status, "evidence_unavailable");
  });

  it("keeps the ledger result for legacy credentials without evidence hashes", async () => {
    const result = await evaluateCredentialVerification(
      snapshot({
        storedEvidenceHashes: null,
        liveEvidenceHashes: [],
        legacyUnverifiedEvidence: true,
        evidenceHashMismatch: true,
      }),
      {
        ...depsBase,
        ledger: ledgerStub({ exists: true, hashMatches: true, status: "active" }),
      },
    );
    assert.equal(result.status, "verified");
    assert.equal(result.detail, "legacy_unverified_evidence");
    assert.equal(credentialShowsVerified(result), false);
  });
});

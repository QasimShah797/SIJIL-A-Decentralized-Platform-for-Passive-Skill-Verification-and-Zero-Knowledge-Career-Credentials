import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLedgerService } from "./ledger.service";
import { LedgerDisabledError } from "./ledger.errors";
import type { AnchorCredentialInput } from "./ledger.types";

const sample: AnchorCredentialInput = {
  credentialId: "11111111-1111-1111-1111-111111111111",
  hash: "ab".repeat(32),
  issuerDid: "did:web:issuer.cust.edu.pk",
  holderDid: "did:key:z6Mktest",
  issuedAt: "2026-09-30T00:00:00.000Z",
};

describe("LedgerService FABRIC_ENABLED=false", () => {
  const ledger = createLedgerService({ enabled: false });

  it("reports disabled and unreachable", async () => {
    assert.equal(ledger.isEnabled(), false);
    assert.equal(await ledger.isReachable(), false);
  });

  it("throws LedgerDisabledError from every ledger call", async () => {
    await assert.rejects(() => ledger.anchorCredential(sample), LedgerDisabledError);
    await assert.rejects(() => ledger.revokeCredential(sample.credentialId, "test"), LedgerDisabledError);
    await assert.rejects(() => ledger.verifyCredential(sample.credentialId, sample.hash), LedgerDisabledError);
    await assert.rejects(() => ledger.getHistory(sample.credentialId), LedgerDisabledError);
  });
});

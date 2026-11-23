import { describe, expect, it } from "vitest";
import {
  buildSsiVerifyFindings,
  extractDisclosedCredentialIdentity,
  formatSsiVerifyDetail,
  mapLedgerVerifyToUiState,
  mapSsiCredentialVerifyToUiState,
  mapVerifyApiError,
  pickSharedCredentialId,
} from "@/lib/recruiter-ssi-verify";
import type { LedgerVerifyResult } from "@/services/api/ledger.api";

function result(partial: Partial<LedgerVerifyResult>): LedgerVerifyResult {
  return {
    status: "verified",
    credentialId: "cred-1",
    hash: "abc",
    anchorTxId: "tx",
    anchoredAt: "2026-01-01T00:00:00.000Z",
    verifiedAt: "2026-01-02T00:00:00.000Z",
    reason: "valid",
    checks: {
      document: "valid",
      signature: "valid",
      holder: "bound",
      evidence: "match",
      issuer: "trusted",
      anchor: "match",
      revocation: "active",
      zkp: "not_applicable",
    },
    ...partial,
  };
}

describe("recruiter SSI verify mapping", () => {
  it("extracts disclosed issuer, date, and DID only", () => {
    const identity = extractDisclosedCredentialIdentity({
      learner: { did: "did:key:z6Mkexample" },
      credentialMetadata: [{
        issuer_name: "SIJIL Issuer",
        valid_from: "2026-03-01T00:00:00.000Z",
        holder_did: "did:key:z6Mkexample",
      }],
    }, "cred-shared");

    expect(identity.issuer).toBe("SIJIL Issuer");
    expect(identity.issuedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(identity.did).toBe("did:key:z6Mkexample");
    expect(identity.credentialId).toBe("cred-shared");
  });

  it("prefers version credential ids", () => {
    expect(pickSharedCredentialId({
      versionCredentialId: "from-version",
      payload: { credentialMetadata: [{ id: "from-meta" }] },
    })).toBe("from-version");
  });

  it("only marks share verified when backend confirmation is complete", () => {
    expect(mapLedgerVerifyToUiState(result({ status: "verified" }))).toBe("verified");
    expect(mapLedgerVerifyToUiState(result({
      status: "verified",
      detail: "legacy_unverified_evidence",
    }))).toBe("unable");
    expect(mapLedgerVerifyToUiState(result({ status: "tampered", reason: "invalid_signature" }))).toBe("failed");
    expect(mapLedgerVerifyToUiState(result({ status: "revoked", reason: "revoked" }))).toBe("revoked");
    expect(mapLedgerVerifyToUiState(result({ status: "ledger_unavailable", reason: "ledger_unavailable" }))).toBe("unable");
    expect(mapLedgerVerifyToUiState(result({ status: "pending_anchor", reason: "pending_anchor" }))).toBe("pending_anchor");
  });

  it("SSI card accepts integrity+ledger verified even when ZKP was not checked", () => {
    expect(mapSsiCredentialVerifyToUiState(result({
      status: "verified",
      reason: "valid",
      checks: {
        document: "valid",
        signature: "valid",
        holder: "bound",
        evidence: "match",
        issuer: "trusted",
        anchor: "match",
        revocation: "active",
        zkp: "not_checked",
      },
    }))).toBe("verified");

    expect(mapLedgerVerifyToUiState(result({
      status: "verified",
      reason: "valid",
      checks: {
        document: "valid",
        signature: "valid",
        holder: "bound",
        evidence: "match",
        issuer: "trusted",
        anchor: "match",
        revocation: "active",
        zkp: "not_checked",
      },
    }))).toBe("unable");
  });

  it("surfaces pending anchor and evidence gaps without claiming verified", () => {
    expect(mapSsiCredentialVerifyToUiState(result({
      status: "pending_anchor",
      reason: "pending_anchor",
      checks: {
        document: "valid",
        signature: "valid",
        holder: "bound",
        evidence: "match",
        issuer: "trusted",
        anchor: "pending",
        revocation: "active",
        zkp: "not_applicable",
      },
    }))).toBe("pending_anchor");

    expect(mapSsiCredentialVerifyToUiState(result({
      status: "evidence_unavailable",
      reason: "evidence_unavailable",
    }))).toBe("evidence_unavailable");

    expect(formatSsiVerifyDetail(result({
      status: "pending_anchor",
      reason: "pending_anchor",
    }), "pending_anchor")).toMatch(/ledger anchor/i);
  });

  it("maps API errors to expired / revoked / unable", () => {
    expect(mapVerifyApiError("API 410: This share has expired")).toBe("expired");
    expect(mapVerifyApiError("API 410: This share was revoked")).toBe("revoked");
    expect(mapVerifyApiError("API 403: Not authorized to verify this credential")).toBe("unable");
  });

  it("builds organized findings for pass and fail panels", () => {
    const passed = buildSsiVerifyFindings(result({ status: "verified", reason: "valid" }), "verified");
    expect(passed.some((item) => item.ok && /signature/i.test(item.detail))).toBe(true);

    const failed = buildSsiVerifyFindings(result({
      status: "pending_anchor",
      reason: "pending_anchor",
      checks: {
        document: "valid",
        signature: "valid",
        holder: "bound",
        evidence: "match",
        issuer: "trusted",
        anchor: "pending",
        revocation: "active",
        zkp: "not_applicable",
      },
    }), "pending_anchor");
    expect(failed.some((item) => !item.ok && /anchor/i.test(item.label))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  isLedgerVerified,
  mapLedgerStatusToBadge,
  mapWalletAnchorStatus,
  shareShowsVerified,
} from "@/lib/ledger-status";
import { statusToVariant } from "@/components/sijil/StatusBadge";

describe("ledger status mapping", () => {
  it("maps each public verify status to the named StatusBadge variant", () => {
    expect(mapLedgerStatusToBadge("verified")).toEqual({ variant: "verified", label: "verified" });
    expect(mapLedgerStatusToBadge("tampered")).toEqual({ variant: "destructive", label: "tampered" });
    expect(mapLedgerStatusToBadge("revoked")).toEqual({ variant: "destructive", label: "revoked" });
    expect(mapLedgerStatusToBadge("pending_anchor")).toEqual({ variant: "pending", label: "pending_anchor" });
    expect(mapLedgerStatusToBadge("ledger_unavailable")).toEqual({
      variant: "warning",
      label: "ledger_unavailable",
    });
    expect(mapLedgerStatusToBadge("evidence_unavailable")).toEqual({
      variant: "warning",
      label: "evidence_unavailable",
    });
    expect(mapLedgerStatusToBadge("verified", "legacy_unverified_evidence")).toEqual({
      variant: "warning",
      label: "legacy_unverified_evidence",
    });
  });

  it("maps wallet anchor statuses to pending / anchored / failed badges", () => {
    expect(mapWalletAnchorStatus("pending")).toEqual({ variant: "pending", label: "pending" });
    expect(mapWalletAnchorStatus("anchored")).toEqual({ variant: "verified", label: "anchored" });
    expect(mapWalletAnchorStatus("failed")).toEqual({ variant: "destructive", label: "failed" });
    expect(mapWalletAnchorStatus("not_required")).toBeNull();
  });
});

describe("evidence_unavailable and legacy_unverified_evidence never render as verified", () => {
  it("is not ledger-verified", () => {
    expect(isLedgerVerified("ledger_unavailable")).toBe(false);
    expect(isLedgerVerified("evidence_unavailable")).toBe(false);
    expect(isLedgerVerified("verified", "legacy_unverified_evidence")).toBe(false);
    expect(isLedgerVerified("verified")).toBe(true);
    expect(isLedgerVerified("tampered")).toBe(false);
    expect(isLedgerVerified("pending_anchor")).toBe(false);
    expect(isLedgerVerified(null)).toBe(false);
  });

  it("does not map to the verified badge variant", () => {
    expect(mapLedgerStatusToBadge("ledger_unavailable").variant).not.toBe("verified");
    expect(mapLedgerStatusToBadge("ledger_unavailable").label).not.toBe("verified");
    expect(mapLedgerStatusToBadge("evidence_unavailable").variant).not.toBe("verified");
    expect(mapLedgerStatusToBadge("evidence_unavailable").label).not.toBe("verified");
    expect(mapLedgerStatusToBadge("verified", "legacy_unverified_evidence").variant).not.toBe("verified");
    expect(mapLedgerStatusToBadge("verified", "legacy_unverified_evidence").label).not.toBe("verified");
  });

  it("does not show public/recruiter Verified even if the API verified flag is true", () => {
    expect(shareShowsVerified({ ledgerStatus: "ledger_unavailable", verified: true })).toBe(false);
    expect(shareShowsVerified({ ledgerStatus: "pending_anchor", verified: true })).toBe(false);
    expect(shareShowsVerified({ ledgerStatus: "tampered", verified: true })).toBe(false);
    expect(shareShowsVerified({ ledgerStatus: "evidence_unavailable", verified: true })).toBe(false);
    expect(shareShowsVerified({
      ledgerStatus: "verified",
      verified: true,
      detail: "legacy_unverified_evidence",
    })).toBe(false);
    expect(shareShowsVerified({ ledgerStatus: "verified", verified: false })).toBe(true);
    expect(shareShowsVerified({ verified: true })).toBe(false);
  });

  it("does not treat those labels as verified via statusToVariant", () => {
    expect(statusToVariant("evidence_unavailable")).not.toBe("verified");
    expect(statusToVariant("legacy_unverified_evidence")).not.toBe("verified");
    expect(statusToVariant("verified")).toBe("verified");
  });
});

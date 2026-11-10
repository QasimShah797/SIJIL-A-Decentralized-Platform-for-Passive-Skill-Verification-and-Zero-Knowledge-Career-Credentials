import { describe, expect, it } from "vitest";
import {
  canConfirmShare,
  presentationSubmitBody,
  projectSelectedFields,
  recipientSees,
  recruiterVerificationLines,
  shareAccess,
  signedPresentationReview,
  walletShareRequest,
  zkpShareAvailability,
} from "./guide";

const fields = [
  { id: "competency_name", label: "Achievement name" },
  { id: "learner_institution", label: "Institution" },
  { id: "learner_contact", label: "Contact details" },
];

describe("privacy-preserving sharing", () => {
  it("requires consent and at least one disclosed field", () => {
    expect(canConfirmShare({ confirmed: false, disclosedCount: 1 })).toBe(false);
    expect(canConfirmShare({ confirmed: true, disclosedCount: 0 })).toBe(false);
    expect(canConfirmShare({ confirmed: true, disclosedCount: 1 })).toBe(true);
  });

  it("rejects an expired or revoked share", () => {
    expect(shareAccess({
      revoked: false,
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: Date.parse("2026-01-01T00:00:00.000Z"),
    })).toBe("expired");
    expect(shareAccess({ revoked: true, expiresAt: "2027-01-01T00:00:00.000Z" })).toBe("revoked");
    expect(recruiterVerificationLines({ access: "expired", ledgerStatus: "verified" })
      .some((line) => line.value === "Not shown.")).toBe(true);
    expect(recruiterVerificationLines({ access: "revoked", ledgerStatus: "verified" })
      .some((line) => line.value.includes("does not delete copies"))).toBe(true);
  });

  it("keeps hidden fields out of the private link request", () => {
    const projected = projectSelectedFields(fields, ["competency_name"]);
    expect(recipientSees(projected.included, "learner_institution")).toBe(false);
    expect(recipientSees(projected.included, "learner_contact")).toBe(false);
    const body = walletShareRequest({
      competencyId: "skill-1",
      selectedFields: projected.included.map((field) => field.id),
      expiresInDays: 30,
    });
    expect(body.selectedFields).toEqual(["competency_name"]);
    expect(body.shareScope).toBe("selected");
    expect(JSON.stringify(body)).not.toMatch(/privateKey|BEGIN PRIVATE KEY|Contact details/);
    expect(projected.hidden).toEqual(["Institution", "Contact details"]);
  });

  it("describes a signed presentation as the whole achievement", () => {
    expect(signedPresentationReview(["TypeScript"]).join(" ")).toMatch(/not hidden/);
  });

  it("does not offer a privacy proof when the blockchain record is inactive", () => {
    expect(zkpShareAvailability({ verified: true, fabric: "unavailable" }).available).toBe(false);
    expect(zkpShareAvailability({ verified: false, fabric: "active" }).available).toBe(false);
    expect(zkpShareAvailability({ verified: true, fabric: "active" }).available).toBe(true);
  });

  it("keeps signature, revocation, and blockchain status separate", () => {
    const lines = recruiterVerificationLines({ access: "active", ledgerStatus: "pending_anchor" });
    expect(lines.map((line) => line.label)).toEqual(["Signature", "Credential", "Blockchain"]);
    expect(lines.find((line) => line.label === "Blockchain")?.value).toMatch(/pending/);
    expect(lines.some((line) => line.value === "Valid" && line.label === "Blockchain")).toBe(false);
  });

  it("reports verification as unavailable when the status service has no result", () => {
    expect(recruiterVerificationLines({ access: "active", ledgerStatus: "ledger_unavailable" })
      .some((line) => line.value === "Verification unavailable")).toBe(true);
    expect(recruiterVerificationLines({ access: "active", ledgerStatus: null })
      .some((line) => line.value === "Not checked yet")).toBe(true);
  });

  it("does not put a private key in a presentation submission", () => {
    const body = presentationSubmitBody({
      challengeId: "11111111-1111-4111-8111-111111111111",
      did: "did:key:z6Mktest",
      signature: "abc",
    });
    expect(Object.keys(body).sort()).toEqual(["challengeId", "did", "signature"]);
    expect(JSON.stringify(body)).not.toMatch(/privateKey|BEGIN PRIVATE KEY/);
  });
});

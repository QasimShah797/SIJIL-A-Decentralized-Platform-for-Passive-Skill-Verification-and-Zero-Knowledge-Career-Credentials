import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandidateCredentials } from "./CandidateCredentials";
import type { RecruiterSkillCard } from "./RecruiterSkillEvidence";
import { verifyCredentialApi } from "@/services/api/recruiter.api";

vi.mock("@/services/api/recruiter.api", () => ({ verifyCredentialApi: vi.fn() }));

const card: RecruiterSkillCard = {
  id: "card", name: "Typescript", domain: null, competencyId: "skill",
  presentationId: "share", credentialId: "credential", createdAt: "2026-11-24T10:00:00Z",
  expiresAt: "2026-12-24T10:00:00Z", selectedFields: ["timestamps"],
  payload: { recruiterCredentialInfo: { issuer: "CUST", issuedAt: "2026-11-24T10:00:00Z" },
    credentialMetadata: [{ issuer_did: "did:example:issuer" }],
    evidence: { notes: "private evidence" } },
};

describe("candidate credentials", () => {
  it("runs authorized verification and shows SIJIL branding without expiry or export controls", async () => {
    vi.mocked(verifyCredentialApi).mockResolvedValue({
      credentialId: "credential", status: "pending_anchor", hash: null, anchoredAt: null,
      anchorTxId: null, verifiedAt: "2026-11-24T10:00:00Z",
      checks: { document: "valid", signature: "valid", holder: "bound", issuer: "trusted",
        anchor: "pending", revocation: "active", evidence: "match", zkp: "not_applicable" },
    });
    render(<CandidateCredentials cards={[card]} />);
    expect(await screen.findByText("Issuer signature verified")).toBeVisible();
    expect(verifyCredentialApi).toHaveBeenCalledWith("credential");
    expect(screen.queryByText("Credential Verified")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy DID" })).not.toBeInTheDocument();
    expect(screen.getByText(/Issued by SIJIL/)).toBeVisible();
    expect(screen.getByText("SIJIL")).toBeVisible();
    expect(screen.queryByText(/CUST|Share valid until/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View Credential|Download Credential/i })).not.toBeInTheDocument();
  });
});

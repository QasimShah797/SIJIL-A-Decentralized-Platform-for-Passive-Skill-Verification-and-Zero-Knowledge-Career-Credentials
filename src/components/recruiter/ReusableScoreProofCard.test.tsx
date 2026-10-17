import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { verifyReusableScoreProof } from "@/services/api/zkp.api";
import { ReusableScoreProofCard } from "./ReusableScoreProofCard";

vi.mock("@/services/api/zkp.api", () => ({
  verifyReusableScoreProof: vi.fn(),
}));

const proofJson = JSON.stringify({
  circuitId: "score-threshold-v1",
  publicSignals: ["60", "100"],
  proof: { protocol: "groth16" },
  locallyVerified: true,
  witness: { score: "73", blinding: "42" },
});

describe("recruiter reusable score proof card", () => {
  it("shows the server result and does not treat a browser flag as success", async () => {
    vi.mocked(verifyReusableScoreProof).mockResolvedValue({
      proofBinding: "reusable-credential-bound-v1",
      circuitId: "score-threshold-v1",
      credentialId: "urn:uuid:sijil:test",
      threshold: "60",
      verified: true,
      message: "Verified: This learner meets the required assessment threshold.",
      replay: "score-threshold-v1 does not include a recruiter challenge.",
      checks: {
        signature: "valid",
        documentHash: "matches",
        credentialRevoked: false,
        circuit: "supported",
        commitment: "matches",
        proof: "valid",
        verificationKey: "pinned",
        fabric: "active",
      },
    });
    render(<ReusableScoreProofCard shareToken="share-token-value" />);
    fireEvent.change(screen.getByLabelText("Reusable assessment proof"), { target: { value: proofJson } });
    fireEvent.click(screen.getByRole("button", { name: "Verify assessment threshold" }));
    await waitFor(() => expect(screen.getByText(/meets the required assessment threshold/)).toBeTruthy());
    expect(screen.getByText("Yes, at least 60")).toBeTruthy();
    expect(screen.queryByText("73")).toBeNull();
    expect(screen.queryByText("42")).toBeNull();
    expect(verifyReusableScoreProof).toHaveBeenCalledWith("share-token-value", {
      circuitId: "score-threshold-v1",
      proof: { protocol: "groth16" },
      publicSignals: ["60", "100"],
    });
  });

  it("shows a failure from the server instead of a local check", async () => {
    vi.mocked(verifyReusableScoreProof).mockResolvedValue({
      proofBinding: "reusable-credential-bound-v1",
      circuitId: "score-threshold-v1",
      credentialId: "urn:uuid:sijil:test",
      threshold: "60",
      verified: false,
      message: "Verification failed: The proof does not match the signed credential.",
      replay: "score-threshold-v1 does not include a recruiter challenge.",
      checks: {
        signature: "valid",
        documentHash: "matches",
        credentialRevoked: false,
        circuit: "supported",
        commitment: "mismatch",
        proof: "invalid",
        verificationKey: "pinned",
        fabric: "not_checked",
      },
    });
    render(<ReusableScoreProofCard shareToken="share-token-value" />);
    fireEvent.change(screen.getByLabelText("Reusable assessment proof"), { target: { value: proofJson } });
    fireEvent.click(screen.getByRole("button", { name: "Verify assessment threshold" }));
    await waitFor(() => expect(screen.getByText(/does not match the signed credential/)).toBeTruthy());
    expect(screen.queryByText(/Local check/)).toBeNull();
  });
});

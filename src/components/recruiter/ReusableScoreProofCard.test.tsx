import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReusableScoreProofCard } from "./ReusableScoreProofCard";
import { getSharedAssessmentPolicy } from "@/services/api/zkp.api";

vi.mock("@/services/api/zkp.api", () => ({ getSharedAssessmentPolicy: vi.fn() }));

describe("recruiter assessment policy card", () => {
  beforeEach(() => vi.mocked(getSharedAssessmentPolicy).mockReset());

  it("loads the verified outcome from the share link without a pasted proof or a score", async () => {
    vi.mocked(getSharedAssessmentPolicy).mockResolvedValue({
      outcome: "MEETS_THRESHOLD",
      threshold: 60,
      zkpType: "score-threshold-v1",
      policyVersion: "assess-60-v1",
      circuitVariant: "meets",
      scope: { credentialId: "urn:cred:a" },
      evidenceFreshAt: "2026-10-31T00:00:00.000Z",
      check: "valid",
      message: "Groth16 proof verified against the signed credential commitment.",
    });
    render(<ReusableScoreProofCard shareToken="share-token-123456" />);
    expect(await screen.findByText("Outcome: Meets threshold")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(vi.mocked(getSharedAssessmentPolicy)).toHaveBeenCalledWith("share-token-123456");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/score:/i)).toBeNull();
  });

  it("shows ERROR as not verified rather than below threshold", async () => {
    vi.mocked(getSharedAssessmentPolicy).mockResolvedValue({
      outcome: "ERROR",
      threshold: 60,
      zkpType: "score-threshold-v1",
      circuitVariant: null,
      scope: null,
      evidenceFreshAt: null,
      check: "not_evaluated",
      message: "Evaluation failed. No outcome is verified.",
    });
    render(<ReusableScoreProofCard shareToken="share-token-123456" />);
    expect(await screen.findByText("Outcome: Error — not verified")).toBeInTheDocument();
    expect(screen.queryByText(/Below threshold/)).toBeNull();
  });
});

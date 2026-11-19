import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentProofRequestCard } from "./AssessmentProofRequestCard";
import { createScoreRequest, getScoreRequest } from "@/services/api/zkp.api";

vi.mock("@/services/api/zkp.api", () => ({
  createScoreRequest: vi.fn(),
  getScoreRequest: vi.fn(),
}));

describe("recruiter minimum score request", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(createScoreRequest).mockReset();
    vi.mocked(getScoreRequest).mockReset();
  });

  it("does not show an accepted result before the server returns one", async () => {
    vi.mocked(createScoreRequest).mockResolvedValue({
      id: "req-1",
      credentialId: "urn:cred:a",
      threshold: 70,
      status: "open",
      expiresAt: "2026-11-16T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
      consumedAt: null,
    });
    render(<AssessmentProofRequestCard shareToken="share-token-123456" />);
    fireEvent.click(screen.getByRole("button", { name: "Request 70% proof" }));
    expect(await screen.findByText("Waiting for the learner")).toBeInTheDocument();
    expect(screen.queryByText("Policy accepted for this request")).toBeNull();
    expect(createScoreRequest).toHaveBeenCalledWith("share-token-123456", 70);
  });

  it("keeps mathematics, the credential, and the blockchain on separate rows", async () => {
    vi.mocked(createScoreRequest).mockResolvedValue({
      id: "req-1",
      credentialId: "urn:cred:a",
      threshold: 70,
      status: "consumed",
      expiresAt: "2026-11-16T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
      consumedAt: "2026-11-15T01:00:00.000Z",
    });
    vi.mocked(getScoreRequest).mockResolvedValue({
      request: {
        id: "req-1",
        credentialId: "urn:cred:a",
        threshold: 70,
        status: "consumed",
        expiresAt: "2026-11-16T00:00:00.000Z",
        createdAt: "2026-11-15T00:00:00.000Z",
        consumedAt: "2026-11-15T01:00:00.000Z",
      },
      decision: {
        accepted: true,
        threshold: 70,
        credentialId: "urn:cred:a",
        checks: {
          mathematics: "valid",
          signature: "valid",
          document: "matches",
          commitment: "matches",
          threshold: "matches",
          holder: "matches",
          revocation: "active",
          ledger: "unavailable",
          request: "accepted",
        },
        message: "Accepted for this request.",
        limitation: "This is not cryptographic freshness.",
      },
    });
    render(<AssessmentProofRequestCard shareToken="share-token-123456" />);
    fireEvent.click(screen.getByRole("button", { name: "Request 70% proof" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check result" }));
    expect(await screen.findByText("Policy accepted for this request")).toBeInTheDocument();
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getByText(/not cryptographic freshness/)).toBeInTheDocument();
  });
});

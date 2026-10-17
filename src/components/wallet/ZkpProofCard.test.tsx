import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getZkpWitness } from "@/services/api/zkp.api";
import { generateScoreThresholdProof, loadPinnedArtifacts } from "@/lib/zkp/generate-score-proof";
import { ZkpProofCard } from "./ZkpProofCard";

vi.mock("@/services/api/zkp.api", () => ({
  getZkpWitness: vi.fn(),
}));

vi.mock("@/lib/zkp/generate-score-proof", () => ({
  loadPinnedArtifacts: vi.fn(),
  generateScoreThresholdProof: vi.fn(),
}));

const credentialId = "urn:uuid:sijil:test:circuits";

describe("wallet zero-knowledge proof card", () => {
  beforeEach(() => {
    vi.mocked(getZkpWitness).mockReset();
    vi.mocked(loadPinnedArtifacts).mockReset();
    vi.mocked(generateScoreThresholdProof).mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("offers a local proof without showing a witness value", () => {
    render(<ZkpProofCard credentialId={credentialId} commitment="100" />);
    expect(screen.getByRole("button", { name: "Generate Zero-Knowledge Proof" })).toBeTruthy();
    expect(screen.getByLabelText("Public threshold")).toHaveValue(60);
    expect(screen.getByText(/separate from selective sharing/i)).toBeTruthy();
    expect(screen.queryByText(/not a recruiter verification/i)).toBeNull();
    expect(screen.queryByText("100")).toBeNull();
  });

  it("accepts a different public threshold", () => {
    render(<ZkpProofCard credentialId={credentialId} commitment="100" />);
    fireEvent.change(screen.getByLabelText("Public threshold"), { target: { value: "80" } });
    expect(screen.getByLabelText("Public threshold")).toHaveValue(80);
  });

  it("shows a loading state and then a local verification without storing the witness", async () => {
    let release: (value: unknown) => void = () => {};
    vi.mocked(getZkpWitness).mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }) as ReturnType<typeof getZkpWitness>);
    render(<ZkpProofCard credentialId={credentialId} commitment="100" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Zero-Knowledge Proof" }));
    expect(screen.getByRole("button", { name: "Generating proof…" })).toBeDisabled();
    expect(screen.getByText("Checking the signed credential…")).toBeTruthy();

    vi.mocked(loadPinnedArtifacts).mockResolvedValue({
      wasm: new Uint8Array(),
      zkey: new Uint8Array(),
      verificationKeyBytes: new Uint8Array(),
    });
    vi.mocked(generateScoreThresholdProof).mockResolvedValue({
      proof: { pi_a: ["1", "2", "1"] },
      publicSignals: ["60", "100"],
      circuitId: "score-threshold-v1",
      credentialId,
      locallyVerified: true,
    });
    release({
      circuitId: "score-threshold-v1",
      credentialId,
      commitment: "100",
      witness: { score: "73", blinding: "42", learnerId: "9", attemptId: "8" },
      artifactHashes: { wasm: "aa", zkey: "bb", verificationKey: "cc" },
    });

    await waitFor(() => expect(screen.getByText("Local check: passed")).toBeTruthy());
    expect(screen.getByText(/not a recruiter verification/i)).toBeTruthy();
    expect(screen.getByText(/threshold 60, commitment 100/)).toBeTruthy();
    expect(screen.queryByText("73")).toBeNull();
    expect(screen.queryByText("42")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(generateScoreThresholdProof).toHaveBeenCalledWith(expect.objectContaining({
      threshold: 60,
      commitment: "100",
    }));
  });

  it("shows an error without revealing the witness", async () => {
    vi.mocked(getZkpWitness).mockRejectedValue(new Error("Not authorized to access this witness"));
    render(<ZkpProofCard credentialId={credentialId} commitment="100" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Zero-Knowledge Proof" }));
    await waitFor(() => expect(screen.getByText("Not authorized to access this witness")).toBeTruthy());
    expect(screen.queryByText(/Local check/)).toBeNull();
    expect(screen.queryByText("73")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

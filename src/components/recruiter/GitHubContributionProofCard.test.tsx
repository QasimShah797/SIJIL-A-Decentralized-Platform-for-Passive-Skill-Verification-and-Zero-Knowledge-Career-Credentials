import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubContributionProofCard } from "./GitHubContributionProofCard";
import { verifyGitHubPolicy } from "@/services/api/github-zkp.api";

vi.mock("@/services/api/github-zkp.api", () => ({ verifyGitHubPolicy: vi.fn() }));

const base = {
  threshold: 70,
  zkpType: "github-contributions-v1",
  policyVersion: "github-70-repo-v1",
  scope: { repositoryFullName: "octo/demo" },
  evidenceFreshAt: "2026-10-31T00:00:00.000Z",
};

async function verifyWith(response: Awaited<ReturnType<typeof verifyGitHubPolicy>>) {
  vi.mocked(verifyGitHubPolicy).mockResolvedValue(response);
  render(<GitHubContributionProofCard />);
  fireEvent.change(screen.getByLabelText("Share code"), { target: { value: "t".repeat(43) } });
  fireEvent.click(screen.getByRole("button", { name: "Verify GitHub policy" }));
}

describe("recruiter GitHub proof card", () => {
  beforeEach(() => vi.mocked(verifyGitHubPolicy).mockReset());

  it("shows a proven below-threshold result with policy, scope, and freshness but no count", async () => {
    await verifyWith({ ...base, outcome: "BELOW_THRESHOLD", circuitVariant: "below", check: "valid", message: "Groth16 proof verified." });
    expect(await screen.findByText("Outcome: Below threshold")).toBeInTheDocument();
    expect(screen.getByText("70 unique authored commits")).toBeInTheDocument();
    expect(screen.getByText("One repository: octo/demo")).toBeInTheDocument();
    expect(screen.queryByText(/contributionCount|blinding/)).toBeNull();
  });

  it("distinguishes NOT_VERIFIED and ERROR from BELOW_THRESHOLD", async () => {
    await verifyWith({ ...base, outcome: "NOT_VERIFIED", circuitVariant: "meets", check: "evidence_stale", message: "GitHub evidence is older than the freshness window." });
    expect(await screen.findByText("Outcome: Not verified")).toBeInTheDocument();
    expect(screen.queryByText(/Below threshold/)).toBeNull();
  });
});

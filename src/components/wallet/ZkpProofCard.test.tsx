import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZkpProofCard } from "./ZkpProofCard";
import { getZkpStatus, type ZkpPolicyStatusItem } from "@/services/api/zkp.api";

vi.mock("@/services/api/zkp.api", () => ({ getZkpStatus: vi.fn() }));

function row(overrides: Partial<ZkpPolicyStatusItem>): ZkpPolicyStatusItem {
  return {
    zkpType: "score-threshold-v1",
    policyVersion: "assess-60-v1",
    threshold: 60,
    outcome: "BELOW_THRESHOLD",
    circuitVariant: "below",
    commitment: "111",
    evidenceRef: "attempt:a",
    evidenceScope: { credentialId: "urn:cred:a" },
    evidenceFreshAt: "2026-10-31T00:00:00.000Z",
    errorCode: null,
    updatedAt: "2026-10-31T00:00:00.000Z",
    hasDisclosure: false,
    ...overrides,
  };
}

describe("wallet assessment proof status", () => {
  beforeEach(() => vi.mocked(getZkpStatus).mockReset());

  it("shows a below-threshold result without hiding the credential or offering manual proof controls", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [row({})],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    expect(await screen.findByText(/Status: Below threshold/)).toBeInTheDocument();
    expect(screen.getByText(/stays in your wallet either way/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never shows another credential's result", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [row({ commitment: "999", outcome: "MEETS_THRESHOLD" })],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.queryByText(/Meets threshold/)).toBeNull();
  });
});

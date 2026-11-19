import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZkpProofCard } from "./ZkpProofCard";
import { getZkpStatus, getZkpWitness, listLearnerScoreRequests, listVerificationRequests, approveVerificationRequest, type ZkpPolicyStatusItem } from "@/services/api/zkp.api";

vi.mock("@/services/api/zkp.api", () => ({
  getZkpStatus: vi.fn(),
  getZkpWitness: vi.fn(),
  listLearnerScoreRequests: vi.fn(),
  listVerificationRequests: vi.fn(),
  approveVerificationRequest: vi.fn(),
  rejectVerificationRequest: vi.fn(),
  declineScoreRequest: vi.fn(),
  submitScoreProof: vi.fn(),
}));

function row(overrides: Partial<ZkpPolicyStatusItem>): ZkpPolicyStatusItem {
  return {
    zkpType: "score-threshold-v1",
    policyVersion: "assess-60-v1",
    threshold: 60,
    outcome: "MEETS_THRESHOLD",
    circuitVariant: "meets",
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

describe("learner score proof card", () => {
  beforeEach(() => {
    vi.mocked(getZkpStatus).mockReset();
    vi.mocked(listLearnerScoreRequests).mockReset();
    vi.mocked(listVerificationRequests).mockReset();
    vi.mocked(listVerificationRequests).mockResolvedValue({ available: true, requests: [] });
  });

  it("explains the proof and shows only this credential's recruiter request", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [row({})],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({
      available: true,
      reason: null,
      requests: [
        {
          id: "req-1",
          credentialId: "urn:cred:a",
          threshold: 70,
          status: "open",
          expiresAt: "2026-11-16T00:00:00.000Z",
          createdAt: "2026-11-15T00:00:00.000Z",
          consumedAt: null,
        },
        {
          id: "req-2",
          credentialId: "urn:cred:other",
          threshold: 80,
          status: "open",
          expiresAt: "2026-11-16T00:00:00.000Z",
          createdAt: "2026-11-15T00:00:00.000Z",
          consumedAt: null,
        },
      ],
    });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    expect(await screen.findByRole("heading", { name: "Private score proof" })).toBeInTheDocument();
    expect(screen.getByText(/without seeing the score itself/)).toBeInTheDocument();
    expect(await screen.findByText(/minimum of 70%/)).toBeInTheDocument();
    expect(screen.queryByText(/minimum of 80%/)).toBeNull();
    expect(screen.queryByText(/Ready/)).toBeNull();
  });

  it("does not show another credential's automatic result as this credential's proof", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [row({ commitment: "999", outcome: "BELOW_THRESHOLD" })],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({ available: true, reason: null, requests: [] });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    expect(await screen.findByText(/Automatic 60% check: not ready/)).toBeInTheDocument();
    expect(screen.queryByText(/Below threshold/)).toBeNull();
  });

  it("keeps a score below the request private and offers decline", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({
      available: true,
      reason: null,
      requests: [{
        id: "req-1",
        credentialId: "urn:cred:a",
        threshold: 70,
        status: "open",
        expiresAt: "2026-11-16T00:00:00.000Z",
        createdAt: "2026-11-15T00:00:00.000Z",
        consumedAt: null,
      }],
    });
    vi.mocked(getZkpWitness).mockResolvedValue({
      circuitId: "score-threshold-v1",
      credentialId: "urn:cred:a",
      commitment: "111",
      witness: { score: "50", blinding: "42", learnerId: "1", attemptId: "2" },
      artifactHashes: { wasm: "aa", zkey: "bb", verificationKey: "cc" },
    });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show my private score" }));
    expect(await screen.findByText(/Your private score is 50%/)).toBeInTheDocument();
    expect(screen.getByText(/You cannot prove this minimum/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate and send proof" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide my private score" }));
    expect(screen.queryByText(/Your private score is 50%/)).toBeNull();
  });

  it("does not describe an unreachable score lookup as a failed proof", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: false,
      assessment: [],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({ available: false, reason: "missing_table", requests: [] });
    vi.mocked(getZkpWitness).mockRejectedValue(new Error(
      "Cannot reach the SIJIL API. Start the backend with `npm run dev` in the backend folder (http://localhost:5000).",
    ));
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show my private score" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The score service could not be reached");
    expect(screen.queryByText(/proof could not be completed/i)).toBeNull();
  });

  it("says the private score is unavailable when the credential has no matching opening", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: false,
      assessment: [],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({ available: true, reason: null, requests: [] });
    vi.mocked(getZkpWitness).mockRejectedValue(new Error(
      "API 409: Assessment commitment does not match the trusted opening",
    ));
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show my private score" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Private score unavailable for this credential");
    expect(screen.queryByText(/proof could not be completed/i)).toBeNull();
  });

  it("keeps approval in the wallet and does not generate a proof before approval", async () => {
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    });
    vi.mocked(listLearnerScoreRequests).mockResolvedValue({
      available: true,
      reason: null,
      requests: [{
        id: "score-1",
        credentialId: "urn:cred:a",
        threshold: 70,
        status: "open",
        expiresAt: "2026-11-16T00:00:00.000Z",
        createdAt: "2026-11-15T00:00:00.000Z",
        consumedAt: null,
      }],
    });
    vi.mocked(listVerificationRequests).mockResolvedValue({
      available: true,
      requests: [{
        id: "mirror-1",
        legacyScoreRequestId: "score-1",
        recruiterUserId: "recruiter-1",
        learnerUserId: "learner-1",
        recruiterLabel: "CUST",
        learnerLabel: "Horain",
        category: "practical-score",
        skillLabel: "TypeScript",
        policyLabel: "At least 70%",
        threshold: 70,
        status: "pending",
        expiresAt: "2026-11-16T00:00:00.000Z",
        createdAt: "2026-11-15T00:00:00.000Z",
      }],
    });
    vi.mocked(approveVerificationRequest).mockResolvedValue({
      id: "mirror-1",
      legacyScoreRequestId: "score-1",
      recruiterUserId: "recruiter-1",
      learnerUserId: "learner-1",
      recruiterLabel: "CUST",
      learnerLabel: "Horain",
      category: "practical-score",
      skillLabel: "TypeScript",
      policyLabel: "At least 70%",
      threshold: 70,
      status: "approved",
      expiresAt: "2026-11-16T00:00:00.000Z",
      createdAt: "2026-11-15T00:00:00.000Z",
    });
    render(<ZkpProofCard credentialId="urn:cred:a" commitment="111" focusVerificationId="mirror-1" />);
    expect(await screen.findByRole("button", { name: "Approve request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate and send proof" })).toBeNull();
    expect(screen.getByText(/CUST requested verification of TypeScript/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve request" }));
    expect(approveVerificationRequest).toHaveBeenCalledWith("mirror-1");
  });
});

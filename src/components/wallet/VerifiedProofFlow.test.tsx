import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { VerifiedProofFlow, VerifiedProofGuide, proofStatusForSkill, type ProofItem } from "./VerifiedProofFlow";
import type { CredentialView } from "@/lib/db/credentials";
import { ApiUnavailableError, apiRequest } from "@/services/api/client";

vi.mock("@/hooks/useLearnerData", () => {
  const skills = [{ id: "exact-typescript-skill" }];
  return { useDeclaredSkills: () => ({ skills, loading: false }) };
});
vi.mock("@/hooks/useSsiIdentity", () => ({
  useSsiIdentity: () => ({ snapshot: { local: null, server: { did: null } } }),
}));
vi.mock("@/services/api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/api/client")>(),
  apiRequest: vi.fn(),
}));
vi.mock("@/lib/db/validation", () => ({
  buildAllValidationSummaries: async () => [{
    skillId: "exact-typescript-skill",
    skill: "TypeScript",
    pipelineStage: "evidence_linked",
    assessmentCompleted: true,
    nextStep: "Complete the practical task for this competency",
    rows: [],
    sources: [],
  }],
}));

function item(overrides: Partial<ProofItem>): ProofItem {
  return {
    skillId: "skill-1",
    skill: "Java Programming",
    status: "pending",
    stageLabel: "Assessment",
    evidence: "Practical task in progress",
    institution: "SIJIL",
    nextStep: "Submit your practical task attempt",
    sources: ["GitHub"],
    result: "In progress",
    pipelineStage: "practical_task",
    issuedAt: null,
    credentialId: null,
    githubCount: 1,
    lmsCount: 1,
    taskCount: 1,
    reviewCount: 0,
    ...overrides,
  };
}

function renderGuide(items: ProofItem[], onIssue = vi.fn(async () => null)) {
  const onViewInWallet = vi.fn();
  render(
    <MemoryRouter>
      <VerifiedProofGuide items={items} loading={false} identityUnlocked onBack={vi.fn()} onViewInWallet={onViewInWallet} onIssue={onIssue} />
    </MemoryRouter>,
  );
  return { onIssue, onViewInWallet };
}

describe("verified proof status", () => {
  it("uses an existing credential before the ready-to-issue stage", () => {
    expect(proofStatusForSkill({ skill: "Java", pipelineStage: "wallet_ready" }, [{ skill: "Java", name: "Other" }])).toBe("issued");
    expect(proofStatusForSkill({ skill: "Java", pipelineStage: "in_wallet" }, [])).toBe("eligible");
    expect(proofStatusForSkill({ skill: "Java", pipelineStage: "declared" }, [])).toBe("pending");
  });
});

describe("verified proof guide", () => {
  it("lets a locked learner review evidence and unlock in place before confirming", async () => {
    const onIssue = vi.fn(async () => null);
    function Harness() {
      const [unlocked, setUnlocked] = useState(false);
      return <VerifiedProofGuide items={[item({ status: "eligible" })]} loading={false} identityUnlocked={unlocked}
        onBack={vi.fn()} onViewInWallet={vi.fn()} onIssue={onIssue} onUnlock={async () => setUnlocked(true)} />;
    }
    render(<MemoryRouter><Harness /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Review Evidence")).toBeInTheDocument();
    expect(screen.getByText("Unlock your identity to issue this credential.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm Issuance/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unlock Identity" }));
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "fixture-only-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock Identity" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm Issuance/ }));
    expect(onIssue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Confirm Issuance/ }));
    expect(onIssue).toHaveBeenCalledWith("skill-1");
  });
  it.each([
    [new ApiUnavailableError("API 404: Route not found: GET /api/credentials/readiness/test", 404), /service does not support readiness checks/],
    [new ApiUnavailableError("API 404: Skill not found", 404), /could not check issuance readiness/],
    [new ApiUnavailableError("Network error"), /could not check issuance readiness/],
  ] as const)("keeps issuance unavailable when readiness fails with %s", async (error, message) => {
    vi.mocked(apiRequest).mockRejectedValueOnce(error);
    render(
      <MemoryRouter>
        <VerifiedProofFlow userId="learner-1" credentials={[]} onBack={vi.fn()} onViewInWallet={vi.fn()} onIssued={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm Issuance/ })).not.toBeInTheDocument();
  });

  it("shows the server's reason instead of asking the learner to repeat a completed task", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ready: false,
      reason: "Link qualifying supporting evidence to this competency.",
    });
    render(
      <MemoryRouter>
        <VerifiedProofFlow userId="learner-1" credentials={[]} onBack={vi.fn()} onViewInWallet={vi.fn()} onIssued={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/Link qualifying supporting evidence/)).toBeInTheDocument();
    expect(screen.queryByText(/Complete the practical task for this competency/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm Issuance/ })).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/credentials/readiness/exact-typescript-skill");
  });

  it("issues only after the learner confirms an eligible achievement", async () => {
    const created = { id: "cred-1", name: "Java Programming", issuer: "SIJIL", verification: "signed" } as CredentialView;
    const onIssue = vi.fn(async () => created);
    const { onViewInWallet } = renderGuide([item({ status: "eligible", pipelineStage: "wallet_ready", stageLabel: "Wallet Ready" })], onIssue);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "Java Programming" })).toBeTruthy();
    expect(screen.getByText("Review Evidence")).toBeTruthy();
    expect(onIssue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Confirm Issuance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Issuance →/ }));
    expect(onIssue).toHaveBeenCalledWith("skill-1");
    expect(await screen.findByRole("heading", { name: "Signed Credential Issued" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View in Wallet" }));
    expect(onViewInWallet).toHaveBeenCalledWith("skill-1");
  });

  it("offers the wallet for an achievement that already has a credential", () => {
    const { onIssue, onViewInWallet } = renderGuide([item({ status: "issued", stageLabel: "In Wallet", pipelineStage: "in_wallet", issuedAt: "2026-11-18" })]);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: "View in Wallet" }));
    expect(onViewInWallet).toHaveBeenCalledWith("skill-1");
    expect(screen.queryByRole("button", { name: /Confirm Issuance →/ })).toBeNull();
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("explains the remaining validation step and links to the existing trail", () => {
    renderGuide([item({ status: "pending" })]);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/Submit your practical task attempt/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Competency Progress" }).getAttribute("href")).toBe("/learner/validation/skill-1");
    expect(screen.queryByRole("button", { name: /Confirm Issuance →/ })).toBeNull();
  });
});

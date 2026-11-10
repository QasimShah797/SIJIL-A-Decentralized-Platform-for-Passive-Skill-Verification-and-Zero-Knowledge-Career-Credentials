import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { VerifiedProofGuide, proofStatusForSkill, type ProofItem } from "./VerifiedProofFlow";
import type { CredentialView } from "@/lib/db/credentials";

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
    ...overrides,
  };
}

function renderGuide(items: ProofItem[], onIssue = vi.fn(async () => null)) {
  const onViewInWallet = vi.fn();
  render(
    <MemoryRouter>
      <VerifiedProofGuide items={items} loading={false} onBack={vi.fn()} onViewInWallet={onViewInWallet} onIssue={onIssue} />
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
  it("issues only after the learner confirms an eligible achievement", async () => {
    const created = { id: "cred-1", name: "Java Programming", issuer: "SIJIL", verification: "signed" } as CredentialView;
    const onIssue = vi.fn(async () => created);
    renderGuide([item({ status: "eligible", pipelineStage: "wallet_ready", stageLabel: "Wallet Ready" })], onIssue);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Java Programming" })).toBeTruthy();
    expect(onIssue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue verified proof" }));
    expect(onIssue).toHaveBeenCalledWith("skill-1");
    expect(await screen.findByRole("heading", { name: "Signed credential issued" })).toBeTruthy();
    expect(screen.getByText(/does not independently verify/)).toBeTruthy();
  });

  it("offers the wallet for an achievement that already has a credential", () => {
    const { onIssue, onViewInWallet } = renderGuide([item({ status: "issued", stageLabel: "In Wallet", pipelineStage: "in_wallet" })]);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "View in Wallet" }));
    expect(onViewInWallet).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Issue verified proof" })).toBeNull();
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("explains the remaining validation step and links to the existing trail", () => {
    renderGuide([item({ status: "pending" })]);
    fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Submit your practical task attempt/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Validation Trail" }).getAttribute("href")).toBe("/learner/validation/skill-1");
    expect(screen.queryByRole("button", { name: "Issue verified proof" })).toBeNull();
  });
});

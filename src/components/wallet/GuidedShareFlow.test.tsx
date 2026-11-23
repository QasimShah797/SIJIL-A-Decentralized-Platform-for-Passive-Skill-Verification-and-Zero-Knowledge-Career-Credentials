import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GuidedShareFlow, type GuidedShareCredential } from "./GuidedShareFlow";
import type { EvidenceShareAvailability } from "@/lib/evidence-share-availability";

const fullAvailability: EvidenceShareAvailability = {
  practical_task_result: { present: true, privateAllowed: true, privateBlockedReason: null },
  github_evidence: { present: true, privateAllowed: true, privateBlockedReason: null },
  lms_evidence: { present: true, privateAllowed: true, privateBlockedReason: null },
  peer_reviews: { present: true, privateAllowed: true, privateBlockedReason: null },
};

const typescriptAvailability: EvidenceShareAvailability = {
  practical_task_result: { present: true, privateAllowed: true, privateBlockedReason: null },
  github_evidence: { present: true, privateAllowed: true, privateBlockedReason: null },
  lms_evidence: { present: false, privateAllowed: false, privateBlockedReason: null },
  peer_reviews: { present: false, privateAllowed: false, privateBlockedReason: null },
};

const credential: GuidedShareCredential = {
  id: "cred-1",
  title: "TypeScript",
  issuer: "SIJIL",
  status: "Issued",
  issuedAt: "2026-11-18T00:00:00.000Z",
  evidenceAvailability: fullAvailability,
};

function renderFlow(overrides: Partial<Parameters<typeof GuidedShareFlow>[0]> = {}) {
  const onShareAll = vi.fn<NonNullable<Parameters<typeof GuidedShareFlow>[0]["onShareAll"]>>(async () => undefined);
  const onCreatePublicLink = vi.fn(async () => ({
    shareUrl: "http://localhost:8080/credential/public-token",
    shareId: "share-uuid-1",
    token: "public-token",
    skillName: "TypeScript",
  }));
  const onEmailPublicLink = vi.fn(async () => undefined);
  render(
    <MemoryRouter>
      <GuidedShareFlow
        credentials={[credential]}
        learnerName="eesha"
        onBack={vi.fn()}
        onShareAll={onShareAll}
        onCreatePublicLink={onCreatePublicLink}
        onEmailPublicLink={onEmailPublicLink}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onShareAll, onCreatePublicLink, onEmailPublicLink };
}

describe("wallet share flow", () => {
  it("passes the selected share to the owner revocation handler", () => {
    const onRevokeManagedShare = vi.fn(async () => true);
    renderFlow({
      managedShares: [{ id: "share-1", label: "TypeScript", kind: "all-recruiters", detail: "", status: "active", sharedAt: null }],
      onRevokeManagedShare,
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(onRevokeManagedShare).toHaveBeenCalledWith("share-1");
  });

  it("shows recruiter and public verification link options", () => {
    renderFlow();
    expect(screen.getByRole("heading", { name: "Share My Achievement" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Share with Recruiter/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create Verification Link/ })).toBeTruthy();
  });

  it("opens Share with Recruiter disclosure before confirming", async () => {
    const { onShareAll } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /Share with Recruiter/ }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Share with Recruiter" })).toBeTruthy();
    expect(screen.getByText("Choose What to Share")).toBeTruthy();
    expect(screen.getByText("Practical Assessment")).toBeTruthy();
    expect(screen.queryByText("Show result privately")).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Practical Assessment" })).getByRole("radio", { name: "Share details" }));
    expect(screen.queryByText(/Selective Disclosure/i)).toBeNull();
    expect(screen.queryByText(/Blockchain Anchored/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue to Preview/ }));
    expect(onShareAll).toHaveBeenCalled();
    const shareArg = onShareAll.mock.calls[0]?.[0];
    expect(shareArg?.evidenceModes).toMatchObject({ practical_task_result: "details", github_evidence: "omit" });
    expect(await screen.findByRole("heading", { name: "Visible to SIJIL Recruiters" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Status: Visible");
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/learner/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Create Another Share" }));
    expect(screen.getByRole("heading", { name: "Share My Achievement" })).toBeInTheDocument();
  });

  it("hides Moodle and Peer cards when TypeScript has no linked evidence", () => {
    renderFlow({
      credentials: [{ ...credential, evidenceAvailability: typescriptAvailability }],
    });
    fireEvent.click(screen.getByRole("button", { name: /Share with Recruiter/ }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Practical Assessment")).toBeTruthy();
    expect(screen.getByText("GitHub Activity")).toBeTruthy();
    expect(screen.queryByText("Moodle Learning")).toBeNull();
    expect(screen.queryByText("Peer Review")).toBeNull();
    expect(screen.queryByText("Preparing result…")).toBeNull();
  });

  it("opens Create Public Link disclosure before success screen", async () => {
    const { onCreatePublicLink, onShareAll, onEmailPublicLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /Create Verification Link/ }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Choose What to Share" })).toBeTruthy();
    expect(screen.queryByText("Show result privately")).toBeNull();
    const github = within(screen.getByRole("radiogroup", { name: "GitHub Activity" }));
    fireEvent.click(github.getByRole("radio", { name: "Share details" }));
    fireEvent.click(github.getByRole("radio", { name: "Don't share" }));
    expect(screen.getByRole("heading", { name: "Preview – Public Link" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create Public Link$/ }));
    expect(onCreatePublicLink).toHaveBeenCalledWith(expect.objectContaining({
      evidenceModes: expect.objectContaining({ github_evidence: "omit" }),
    }));
    expect(onShareAll).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Public Verification Link Created" })).toBeTruthy();
    expect(screen.getByDisplayValue("http://localhost:8080/credential/public-token")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "recruiter@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    expect(onEmailPublicLink).toHaveBeenCalledWith({
      shareId: "share-uuid-1",
      token: "public-token",
      recipientEmail: "recruiter@example.com",
    });
  });
});

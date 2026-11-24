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
  const wrap = (props: Partial<Parameters<typeof GuidedShareFlow>[0]>) => (
    <MemoryRouter>
      <GuidedShareFlow
        credentials={[credential]}
        learnerName="eesha"
        onBack={vi.fn()}
        onShareAll={onShareAll}
        onCreatePublicLink={onCreatePublicLink}
        onEmailPublicLink={onEmailPublicLink}
        {...props}
      />
    </MemoryRouter>
  );
  const { rerender } = render(wrap(overrides));
  return { onShareAll, onCreatePublicLink, onEmailPublicLink, update: (next: typeof overrides) => rerender(wrap(next)) };
}

describe("wallet share flow", () => {
  it("shows recruiter and public verification link options", () => {
    renderFlow();
    expect(screen.getByRole("heading", { name: "Share My Achievement" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share with Recruiters on SIJIL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Public Page" })).toBeTruthy();
  });

  it.each([
    ["Share with Recruiters on SIJIL", "Choose Achievements", "2 selected", "true"],
    ["Create Public Page", "Choose Credential", "1 selected", "false"],
  ])("shows selection controls for %s", (action, heading, count, firstPressed) => {
    renderFlow({ credentials: [{ ...credential, status: "Verified" }, { ...credential, id: "cred-2", title: "Python" }] });
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Manage shared access" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    const first = screen.getByRole("button", { name: /TypeScript/ });
    expect(within(first).getByText("Verified")).toBeVisible();
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: /Python/ }));
    expect(first).toHaveAttribute("aria-pressed", firstPressed);
    expect(screen.getByText(count)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("opens Share with Recruiter disclosure before confirming", async () => {
    const { onShareAll } = renderFlow({ credentials: [{ ...credential, recruiterEvidencePreview: { practical_task_result: "Completed attempt count and latest marks and percentage" } }] });
    fireEvent.click(screen.getByRole("button", { name: "Share with Recruiters on SIJIL" }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Share with Recruiters" })).toBeTruthy();
    expect(screen.getByText("Select Information to Share")).toBeTruthy();
    expect(screen.getByText("Practical Assessment")).toBeTruthy();
    expect(screen.queryByText("Show result privately")).toBeNull();
    const assessment = screen.getByRole("switch", { name: "Practical Assessment" });
    expect(assessment).not.toBeChecked();
    fireEvent.click(assessment);
    expect(screen.getByText("Completed attempt count and latest marks and percentage")).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Learner Name" }));
    expect(screen.queryByText("eesha")).toBeNull();
    expect(screen.queryByText(/Selective Disclosure/i)).toBeNull();
    expect(screen.queryByText(/Blockchain Anchored/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue to Preview/ }));
    expect(onShareAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Share with Recruiters" }));
    expect(onShareAll).toHaveBeenCalled();
    const shareArg = onShareAll.mock.calls[0]?.[0];
    expect(shareArg?.evidenceModesByCredential["cred-1"]).toMatchObject({ practical_task_result: "details", github_evidence: "omit" });
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
    fireEvent.click(screen.getByRole("button", { name: "Share with Recruiters on SIJIL" }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Practical Assessment")).toBeTruthy();
    expect(screen.getByText("GitHub Activity")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Moodle Activity" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Peer Review Feedback" })).toBeNull();
    expect(screen.queryByText("Preparing result…")).toBeNull();
  });

  it("shows newly synced evidence without opting in or borrowing another credential’s settings", () => {
    const python = { ...credential, id: "cred-2", title: "Python", evidenceAvailability: fullAvailability };
    const typescript = { ...credential, evidenceAvailability: typescriptAvailability };
    const { update, onShareAll } = renderFlow({ credentials: [typescript, python] });
    fireEvent.click(screen.getByRole("button", { name: "Share with Recruiters on SIJIL" }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: /Python/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("switch", { name: "Moodle Activity" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Credential" }), { target: { value: "cred-2" } });
    fireEvent.click(screen.getByRole("switch", { name: "Moodle Activity" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Credential" }), { target: { value: "cred-1" } });
    update({ credentials: [{ ...typescript, evidenceAvailability: fullAvailability }, python] });
    expect(screen.getByRole("switch", { name: "Moodle Activity" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Peer Review Feedback" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Share with Recruiters" }));
    expect(onShareAll).toHaveBeenCalledWith(expect.objectContaining({
      evidenceModesByCredential: {
        "cred-1": expect.objectContaining({ lms_evidence: "omit", peer_reviews: "omit" }),
        "cred-2": expect.objectContaining({ lms_evidence: "details", peer_reviews: "omit" }),
      },
    }));
  });

  it("opens Create Public Link disclosure before success screen", async () => {
    const { onCreatePublicLink, onShareAll, onEmailPublicLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Create Public Page" }));
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

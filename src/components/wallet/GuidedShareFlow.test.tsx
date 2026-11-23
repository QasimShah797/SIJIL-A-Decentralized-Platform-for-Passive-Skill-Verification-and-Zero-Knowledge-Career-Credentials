import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuidedShareFlow, type GuidedShareCredential } from "./GuidedShareFlow";

const credential: GuidedShareCredential = {
  id: "cred-1",
  title: "TypeScript",
  issuer: "SIJIL",
  status: "Issued",
};

function renderFlow(overrides: Partial<Parameters<typeof GuidedShareFlow>[0]> = {}) {
  const onShareAll = vi.fn(async () => undefined);
  const onCreatePublicLink = vi.fn(async () => ({
    shareUrl: "http://localhost:8080/credential/public-token",
    shareId: "share-uuid-1",
    token: "public-token",
    skillName: "TypeScript",
  }));
  const onEmailPublicLink = vi.fn(async () => undefined);
  render(
    <GuidedShareFlow
      credentials={[credential]}
      onBack={vi.fn()}
      onShareAll={onShareAll}
      onCreatePublicLink={onCreatePublicLink}
      onEmailPublicLink={onEmailPublicLink}
      {...overrides}
    />,
  );
  return { onShareAll, onCreatePublicLink, onEmailPublicLink };
}

describe("wallet share flow", () => {
  it("shows both all-recruiters and public verification link options", () => {
    renderFlow();
    expect(screen.getByRole("heading", { name: "Share My Achievements" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share with All SIJIL Recruiters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Public Verification Link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share with a SIJIL recruiter" })).toBeNull();
  });

  it("does not continue all-recruiters until an achievement is selected", () => {
    const { onShareAll } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Share with All SIJIL Recruiters" }));
    expect(screen.getByRole("button", { name: "Review sharing" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Review sharing" }));
    expect(onShareAll).not.toHaveBeenCalled();
  });

  it("requires consent before sharing with all recruiters", async () => {
    const { onShareAll } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Share with All SIJIL Recruiters" }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review sharing" }));
    expect(screen.getByRole("button", { name: "Share with All Recruiters" })).toHaveProperty("disabled", true);
    expect(onShareAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("I agree that every registered SIJIL recruiter may see this information."));
    fireEvent.click(screen.getByRole("button", { name: "Share with All Recruiters" }));
    expect(onShareAll).toHaveBeenCalledWith({
      credentialIds: ["cred-1"],
      selectedFields: [
        "competency_name",
        "competency_domain",
        "verification_status",
        "learner_name",
        "learner_institution",
        "github_evidence",
        "lms_evidence",
        "practical_task_result",
        "peer_reviews",
      ],
    });
    expect(await screen.findByText("Your achievements are now visible to all SIJIL recruiters.")).toBeTruthy();
  });

  it("creates a public verification link with copy and email delivery", async () => {
    const { onCreatePublicLink, onShareAll, onEmailPublicLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Create Public Verification Link" }));
    fireEvent.click(screen.getByRole("button", { name: /TypeScript/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review public link" }));
    fireEvent.click(screen.getByLabelText("I agree to share this information through a public verification link."));
    fireEvent.click(screen.getByRole("button", { name: "Generate public link" }));
    expect(onCreatePublicLink).toHaveBeenCalledWith({
      credentialId: "cred-1",
      selectedFields: [
        "competency_name",
        "competency_domain",
        "verification_status",
        "learner_name",
        "learner_institution",
        "github_evidence",
        "lms_evidence",
        "practical_task_result",
        "peer_reviews",
      ],
      expiresInDays: 30,
    });
    expect(onShareAll).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Public Verification Link Created" })).toBeTruthy();
    expect(screen.getByText("http://localhost:8080/credential/public-token")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy Link" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Recipient email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    expect(onEmailPublicLink).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter a valid recipient email address.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Recipient email"), { target: { value: "recruiter@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    expect(onEmailPublicLink).toHaveBeenCalledWith({
      shareId: "share-uuid-1",
      token: "public-token",
      recipientEmail: "recruiter@example.com",
    });
    expect(await screen.findByText("Email sent successfully")).toBeTruthy();
  });

  it("lets the learner stop an active all-recruiter share", () => {
    const onRevokeManagedShare = vi.fn(async () => undefined);
    renderFlow({
      managedShares: [{
        id: "share-1",
        label: "TypeScript",
        kind: "all-recruiters",
        detail: "",
        status: "active",
        sharedAt: "2026-11-15T00:00:00.000Z",
      }],
      onRevokeManagedShare,
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(onRevokeManagedShare).toHaveBeenCalledWith("share-1");
  });
});

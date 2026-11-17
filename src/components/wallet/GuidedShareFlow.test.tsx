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
  render(
    <GuidedShareFlow
      credentials={[credential]}
      onBack={vi.fn()}
      onShareAll={onShareAll}
      {...overrides}
    />,
  );
  return { onShareAll };
}

describe("wallet share flow", () => {
  it("shows only sharing with all recruiters", () => {
    renderFlow();
    expect(screen.getByRole("heading", { name: "Share My Achievements" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share with a SIJIL recruiter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create a public verification link" })).toBeNull();
    expect(screen.queryByLabelText("Who this share is for")).toBeNull();
  });

  it("does not continue until an achievement is selected", () => {
    const { onShareAll } = renderFlow();
    expect(screen.getByRole("button", { name: "Review sharing" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Review sharing" }));
    expect(onShareAll).not.toHaveBeenCalled();
  });

  it("requires consent before sharing with all recruiters", async () => {
    const { onShareAll } = renderFlow();
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
      ],
    });
    expect(await screen.findByText("Your achievements are now visible to all SIJIL recruiters.")).toBeTruthy();
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

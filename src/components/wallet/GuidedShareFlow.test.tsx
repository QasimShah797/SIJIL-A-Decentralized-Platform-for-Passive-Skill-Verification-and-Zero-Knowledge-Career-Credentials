import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuidedShareFlow, type GuidedShareCredential } from "./GuidedShareFlow";

const credential: GuidedShareCredential = {
  id: "cred-1",
  title: "Java Programming",
  issuer: "SIJIL",
  status: "Issued",
};

function renderFlow(overrides: Partial<Parameters<typeof GuidedShareFlow>[0]> = {}) {
  const onApprove = vi.fn(async () => ({ verifyUrl: "https://sijil.example/verify/vp/vp-1", presentationId: "vp-1" }));
  const onUnlock = vi.fn(async () => undefined);
  const onRevoke = vi.fn(async () => true);
  render(
    <GuidedShareFlow
      credentials={[credential]}
      historicalCount={0}
      canSign
      identityLocked={false}
      identityNote={null}
      audience="sijil-recruiter-verify"
      onAudienceChange={vi.fn()}
      onUnlock={onUnlock}
      unlockWorking={false}
      onApprove={onApprove}
      onRevoke={onRevoke}
      onBack={vi.fn()}
      {...overrides}
    />,
  );
  return { onApprove, onUnlock, onRevoke };
}

function chooseAchievement() {
  fireEvent.click(screen.getByRole("button", { name: /Java Programming/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("guided share flow", () => {
  it("does not continue when no achievement is selected", () => {
    const { onApprove } = renderFlow();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Share My Achievements" })).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("asks for the existing unlock before a locked identity can approve", () => {
    const { onApprove, onUnlock } = renderFlow({ canSign: false, identityLocked: true });
    chooseAchievement();
    expect(screen.getByLabelText("Recovery password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve share" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "long-enough-phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock Identity" }));
    expect(onUnlock).toHaveBeenCalledWith("long-enough-phrase");
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("does not sign when the learner goes back before approval", () => {
    const { onApprove } = renderFlow();
    chooseAchievement();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Review what will be shared" })).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("shows the verification link only after sharing succeeds", async () => {
    const { onApprove } = renderFlow();
    chooseAchievement();
    fireEvent.click(screen.getByRole("button", { name: "Approve share" }));
    expect(onApprove).toHaveBeenCalledWith({ credentialIds: ["cred-1"], audience: "sijil-recruiter-verify" });
    expect(await screen.findByRole("heading", { name: "Your verification link is ready" })).toBeTruthy();
    expect(screen.getByText("https://sijil.example/verify/vp/vp-1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open verification page" }).getAttribute("href")).toBe("https://sijil.example/verify/vp/vp-1");
  });

  it("stays on approval and shows an error when sharing fails", async () => {
    const onApprove = vi.fn(async () => {
      throw new Error("Signing failed");
    });
    renderFlow({ onApprove });
    chooseAchievement();
    fireEvent.click(screen.getByRole("button", { name: "Approve share" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Signing failed");
    expect(screen.queryByRole("heading", { name: "Your verification link is ready" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Approve this share" })).toBeTruthy();
  });

  it("keeps stop access available after a successful share", async () => {
    const { onRevoke } = renderFlow();
    chooseAchievement();
    fireEvent.click(screen.getByRole("button", { name: "Approve share" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop access" }));
    expect(onRevoke).toHaveBeenCalledWith("vp-1");
    expect(await screen.findByRole("heading", { name: "This share link has been stopped" })).toBeTruthy();
    expect(screen.getByText(/does not erase a copy someone already saved/)).toBeTruthy();
  });
});

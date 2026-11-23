import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ShareAchievementFlow } from "./ShareAchievementFlow";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  }
});

const fields = [
  { id: "competency_name", label: "Achievement name" },
  { id: "learner_institution", label: "Issuer" },
];

function renderFlow(onCreateLink = vi.fn()) {
  render(
    <ShareAchievementFlow
      skill="TypeScript"
      fields={fields}
      linkAvailable
      zkp={{ verified: true, fabric: "unavailable" }}
      working={false}
      error={null}
      resultUrl={null}
      onCreateLink={onCreateLink}
      onCreateAll={vi.fn()}
      onCreateSigned={vi.fn()}
    />,
  );
  return { onCreateLink };
}

describe("share achievement flow", () => {
  it("shows all-recruiters and public verification link options", () => {
    render(
      <ShareAchievementFlow
        skill="TypeScript"
        fields={fields}
        linkAvailable
        zkp={{ verified: false, fabric: null }}
        working={false}
        error={null}
        resultUrl={null}
        onCreateLink={vi.fn()}
        onCreateAll={vi.fn()}
        onCreateSigned={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Share with All SIJIL Recruiters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Public Verification Link" })).toBeTruthy();
    expect(screen.queryByText("Manage Shared Access")).not.toBeInTheDocument();
  });

  it("does not create a link before the learner confirms", () => {
    const { onCreateLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Create Public Verification Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Sharing" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Share" }));
    expect(screen.getByRole("button", { name: "Confirm & Share" })).toHaveProperty("disabled", true);
    expect(onCreateLink).not.toHaveBeenCalled();
    expect(screen.getByText(/not shown as verified/i)).toBeTruthy();
  });

  it("sends only the selected fields after consent", () => {
    const { onCreateLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Create Public Verification Link" }));
    fireEvent.click(screen.getByLabelText("Issuer"));
    fireEvent.click(screen.getByRole("button", { name: "Review Sharing" }));
    expect(screen.getByText("Not included: Issuer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Share" }));
    fireEvent.click(screen.getByLabelText("I agree to share this information."));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Share" }));
    expect(onCreateLink).toHaveBeenCalledWith({
      selectedFields: ["competency_name"],
      hiddenLabels: ["Issuer"],
      expiresInDays: 30,
    });
  });
});

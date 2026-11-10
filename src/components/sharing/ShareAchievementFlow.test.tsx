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
      shares={[{ token: "share-1", label: "TypeScript", access: "active", kind: "link" }]}
      working={false}
      error={null}
      resultUrl={null}
      onCreateLink={onCreateLink}
      onCreateSigned={vi.fn()}
      onRevoke={vi.fn()}
    />,
  );
  return { onCreateLink };
}

describe("share achievement flow", () => {
  it("shows sharing history as unavailable instead of an empty list", () => {
    const onRetryHistory = vi.fn();
    render(
      <ShareAchievementFlow
        skill="TypeScript"
        fields={fields}
        linkAvailable
        zkp={{ verified: false, fabric: null }}
        shares={[]}
        working={false}
        error={null}
        resultUrl={null}
        historyUnavailable
        onRetryHistory={onRetryHistory}
        onCreateLink={vi.fn()}
        onCreateSigned={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage Shared Access" }));
    expect(screen.getByText("Sharing history temporarily unavailable")).toBeTruthy();
    expect(screen.queryByText("No saved shares for this achievement yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryHistory).toHaveBeenCalledOnce();
  });
  it("does not create a link before the learner confirms", () => {
    const { onCreateLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Choose Information" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Sharing" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Share" }));
    expect(screen.getByRole("button", { name: "Confirm & Share" })).toHaveProperty("disabled", true);
    expect(onCreateLink).not.toHaveBeenCalled();
    expect(screen.getByText(/not shown as verified/i)).toBeTruthy();
  });

  it("sends only the selected fields after consent", () => {
    const { onCreateLink } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Choose Information" }));
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

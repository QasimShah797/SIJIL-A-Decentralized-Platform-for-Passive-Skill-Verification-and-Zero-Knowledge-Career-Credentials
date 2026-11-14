import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LearnerCredentialCards, type CredentialCardModel } from "./LearnerCredentialCards";

const base: CredentialCardModel = {
  id: "urn:uuid:sijil:test-cred",
  skill: "TypeScript",
  issuer: "CUST",
  issued: "2026-01-15T00:00:00.000Z",
  expires: null,
  signature: "valid",
  revocation: "active",
  blockchain: "pending",
  holder: "match",
  canShare: true,
  hash: "ab".repeat(32),
  integrity: "ok",
};

function renderCards(items: CredentialCardModel[], onDownload = vi.fn()) {
  render(
    <MemoryRouter>
      <LearnerCredentialCards
        items={items}
        loading={false}
        importing={false}
        error={null}
        onDownload={onDownload}
        onImport={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onDownload };
}

describe("credential cards", () => {
  it("shows an empty local wallet and does not offer a download", () => {
    renderCards([]);
    expect(screen.getByText("No verified achievements are saved on this device yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });

  it("downloads from the card and links to the existing share flow", () => {
    const { onDownload } = renderCards([base]);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onDownload).toHaveBeenCalledWith(base.id);
    expect(screen.getByRole("link", { name: "Share" }).getAttribute("href")).toBe(
      `/learner/credential/${encodeURIComponent(base.id)}/share`,
    );
  });

  it("shows a revoked credential as not currently valid", () => {
    renderCards([{ ...base, revocation: "revoked", blockchain: "unknown" }]);
    expect(screen.getByText(/not currently valid/)).toBeTruthy();
    expect(screen.queryByText(/blockchain record matches/)).toBeNull();
  });
});

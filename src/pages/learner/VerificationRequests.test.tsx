import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LearnerVerificationRequests from "./VerificationRequests";

vi.mock("@/components/sijil/LearnerWorkspaceShell", () => ({
  LearnerWorkspaceShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useVerificationNotifications", () => ({
  useVerificationNotifications: () => ({
    notifications: [{
      id: "note-1",
      recipientUserId: "learner-1",
      requestId: "request-1",
      audience: "learner",
      kind: "request_created",
      title: "New verification request",
      body: "A recruiter has requested verification of your TypeScript skill with a minimum threshold of 70%. Please open your Wallet to review this request.",
      readAt: null,
      createdAt: "2026-11-15T12:00:00.000Z",
    }],
    available: true,
    unread: 1,
    reload: vi.fn(),
    markRead: vi.fn(),
  }),
}));

describe("learner verification notifications", () => {
  it("shows the notice and links to the wallet without request actions", () => {
    render(
      <MemoryRouter>
        <LearnerVerificationRequests />
      </MemoryRouter>,
    );
    expect(screen.getByText("New verification request")).toBeInTheDocument();
    expect(screen.getByText(/open your Wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Wallet" })).toHaveAttribute("href", "/learner/wallet?verification=request-1");
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });
});

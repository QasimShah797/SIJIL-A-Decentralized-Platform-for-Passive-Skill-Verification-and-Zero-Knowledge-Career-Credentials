import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationBell } from "./VerificationBell";
import { listVerificationNotifications } from "@/services/api/zkp.api";

vi.mock("@/services/api/zkp.api", () => ({
  listVerificationNotifications: vi.fn(),
  markVerificationNotificationRead: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "learner-1" } }),
}));

const channels = new Map<string, { subscribed: boolean }>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (name: string) => {
      const existing = channels.get(name);
      if (existing?.subscribed) {
        return {
          on: () => {
            throw new Error(`cannot add callbacks for ${name} after subscribe().`);
          },
          subscribe: () => existing,
        };
      }
      const channel = {
        subscribed: false,
        on() {
          if (this.subscribed) throw new Error(`cannot add callbacks for ${name} after subscribe().`);
          return this;
        },
        subscribe() {
          this.subscribed = true;
          return this;
        },
      };
      channels.set(name, channel);
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

describe("verification bell", () => {
  beforeEach(() => {
    channels.clear();
    vi.mocked(listVerificationNotifications).mockReset();
  });

  it("shows an unread badge for a saved request notification", async () => {
    vi.mocked(listVerificationNotifications).mockResolvedValue({
      available: true,
      notifications: [{
        id: "note-1",
        recipientUserId: "learner-1",
        requestId: "request-1",
        audience: "learner",
        kind: "request_created",
        title: "New ZKP Verification Request",
        body: "CUST has requested proof that your TypeScript practical assessment score is at least 70%. Your exact marks will remain private.",
        readAt: null,
        createdAt: "2026-11-15T12:00:00.000Z",
      }],
    });
    render(
      <MemoryRouter>
        <VerificationBell role="learner" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "1 verification notifications" })).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("keeps the page mounted when the bell and the request page both listen", async () => {
    vi.mocked(listVerificationNotifications).mockResolvedValue({ available: true, notifications: [] });
    render(
      <MemoryRouter>
        <VerificationBell role="learner" />
        <VerificationBell role="learner" />
      </MemoryRouter>,
    );
    const buttons = await screen.findAllByRole("button", { name: "Verification notifications" });
    expect(buttons).toHaveLength(2);
    expect(channels.size).toBe(2);
  });
});

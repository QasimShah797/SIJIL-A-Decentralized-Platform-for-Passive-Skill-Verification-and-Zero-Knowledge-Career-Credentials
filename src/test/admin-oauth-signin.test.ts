import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchUserRoles = vi.fn();
const verifyAdminAccess = vi.fn();

vi.mock("@/lib/auth-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-helpers")>("@/lib/auth-helpers");
  return {
    ...actual,
    fetchUserRoles: (...args: unknown[]) => fetchUserRoles(...args),
  };
});

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminAccess: (...args: unknown[]) => verifyAdminAccess(...args),
}));

vi.mock("@/lib/learner-auth", () => ({
  verifyLearnerAccess: vi.fn(),
}));

vi.mock("@/lib/learner-signup", () => ({
  provisionOAuthLearner: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: {} },
}));

describe("completeOAuthAdminSignIn", () => {
  beforeEach(() => {
    fetchUserRoles.mockReset();
    verifyAdminAccess.mockReset();
    sessionStorage.clear();
  });

  it("redirects admins to /admin/integrations without provisioning learners", async () => {
    verifyAdminAccess.mockResolvedValue({ ok: true });
    const { completeOAuthAdminSignIn, setOAuthSignInIntent, peekOAuthSignInIntent } = await import(
      "@/lib/oauth-signin"
    );
    setOAuthSignInIntent("admin");
    expect(peekOAuthSignInIntent()).toBe("admin");

    const destination = await completeOAuthAdminSignIn({ id: "admin-1" } as never);
    expect(destination).toBe("/admin/integrations");
    expect(verifyAdminAccess).toHaveBeenCalledWith("admin-1");
  });

  it("rejects non-admin accounts with a clear message", async () => {
    verifyAdminAccess.mockResolvedValue({ ok: false, reason: "wrong_role" });
    const { completeOAuthAdminSignIn } = await import("@/lib/oauth-signin");
    await expect(completeOAuthAdminSignIn({ id: "learner-1" } as never)).rejects.toThrow(
      /not a SIJIL administrator/i,
    );
  });
});

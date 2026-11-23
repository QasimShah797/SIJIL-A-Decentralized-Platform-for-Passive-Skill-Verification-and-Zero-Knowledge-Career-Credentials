import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { verifySignupEmailOtp } from "./email-verification";
import { completeLearnerSignupAfterEmailVerification, signupLearner } from "./learner-signup";

const user: User = { id: "test-learner", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signUp: vi.fn(), verifyOtp: vi.fn(), getUser: vi.fn() },
    from: vi.fn(),
  },
}));

describe("learner email confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a pending confirmation instead of signing in or provisioning without a session", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user, session: null }, error: null,
    });
    await expect(signupLearner({
      fullName: "Test Learner", email: "Test@Example.com", password: "fixture-password",
    })).resolves.toEqual({ userId: user.id, email: "test@example.com", needsEmailVerification: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a failed code verification before provisioning", async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { user: null, session: null }, error: new AuthError("expired"),
    });
    await expect(verifySignupEmailOtp("test@example.com", "000000"))
      .rejects.toThrow(/expired/i);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "test@example.com", token: "000000", type: "signup",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates an incomplete profile after verifying the email", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { ...user, email: "test@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as unknown as ReturnType<typeof supabase.from>);

    await completeLearnerSignupAfterEmailVerification(user.id);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user.id, role: "learner" }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user.id, profile_completed: false }));
  });
});

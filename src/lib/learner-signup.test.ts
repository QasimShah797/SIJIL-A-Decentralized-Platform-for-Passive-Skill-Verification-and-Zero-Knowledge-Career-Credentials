import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { confirmLearnerSignup, signupLearner } from "./learner-signup";

const user: User = { id: "test-learner", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signUp: vi.fn(), verifyOtp: vi.fn() },
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
    })).resolves.toEqual({ status: "confirmation_required", email: "test@example.com" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a failed code verification before provisioning", async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { user: null, session: null }, error: new AuthError("expired"),
    });
    await expect(confirmLearnerSignup("test@example.com", "000000", "Test Learner"))
      .rejects.toThrow("Could not verify that code");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "test@example.com", token: "000000", type: "email",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

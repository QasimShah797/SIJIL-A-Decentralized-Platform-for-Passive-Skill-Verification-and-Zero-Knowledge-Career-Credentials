import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUp(...args),
      getUser: vi.fn(),
    },
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/lib/db/learner-profile-columns", () => ({
  isMissingColumnError: () => false,
  stripNonDbColumns: <T>(value: T) => value,
}));

import {
  extractAuthErrorMessage,
  formatSignupToastError,
  isSignupNetworkFailure,
  parseAuthSignupError,
  signupLearner,
} from "@/lib/learner-signup";

describe("signupLearner email OTP gate", () => {
  beforeEach(() => {
    signUp.mockReset();
    from.mockReset();
    sessionStorage.clear();
  });

  it("maps Failed to fetch into an actionable signup error", () => {
    expect(isSignupNetworkFailure({ message: "Failed to fetch", status: 0 })).toBe(true);
    expect(parseAuthSignupError({
      message: "Failed to fetch",
      status: 0,
      name: "AuthRetryableFetchError",
    }).message).toMatch(/network\/Auth timeout/i);
    expect(parseAuthSignupError({
      message: "Failed to fetch",
      status: 0,
      name: "AuthRetryableFetchError",
    }).recoveryHint).toBe(true);
  });

  it("never shows '{}' when Auth returns an empty JSON error body", () => {
    const err = parseAuthSignupError({
      name: "AuthApiError",
      message: "{}",
      status: 500,
      code: "unexpected_failure",
    });
    expect(err.message).not.toContain("{}");
    expect(err.message).toMatch(/confirmation email|Verify email|Do not sign up again/i);
    expect(formatSignupToastError(err)).not.toContain("{}");
    expect(extractAuthErrorMessage({ message: "{}" })).toBe("");
  });

  it("maps SMTP / mailer style failures with recovery guidance", () => {
    const err = parseAuthSignupError({
      name: "AuthApiError",
      message: "Error sending confirmation email",
      status: 500,
      code: "unexpected_failure",
    });
    expect(err.recoveryHint).toBe(true);
    expect(err.message).toMatch(/confirmation email/i);
    expect(err.message).toMatch(/Do not sign up again/i);
  });

  it("guides existing unverified accounts away from another signup", () => {
    const err = parseAuthSignupError({
      message: "User already registered",
      code: "user_already_exists",
      status: 422,
    });
    expect(err.field).toBe("email");
    expect(err.recoveryHint).toBe(true);
    expect(err.message).toMatch(/Verify email/i);
  });

  it("formats thrown AuthRetryableFetchError without stringifying the object", () => {
    const thrown = Object.assign(new Error("{}"), {
      name: "AuthRetryableFetchError",
      status: 504,
    });
    const message = formatSignupToastError(thrown);
    expect(message).not.toBe("{}");
    expect(message).not.toMatch(/^\[object /i);
    expect(message).toMatch(/timeout|Verify email|Do not sign up again/i);
  });

  it("treats thrown fetch TypeErrors as network signup failures once (no auto-retry)", async () => {
    signUp.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      signupLearner({
        fullName: "Net Fail",
        email: "netfail@example.com",
        password: "Password1!",
      }),
    ).rejects.toThrow(/network\/Auth timeout/i);
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("defers role/profile creation when email confirmation is required", async () => {
    signUp.mockResolvedValue({
      data: {
        user: {
          id: "pending-1",
          email: "new@example.com",
          email_confirmed_at: null,
          identities: [{ provider: "email" }],
        },
        session: null,
      },
      error: null,
    });

    const result = await signupLearner({
      fullName: "New Learner",
      email: "new@example.com",
      password: "Password1!",
    });

    expect(result).toEqual({
      userId: "pending-1",
      email: "new@example.com",
      needsEmailVerification: true,
    });
    expect(sessionStorage.getItem("sijil.pendingSignupEmail")).toBe("new@example.com");
    expect(from).not.toHaveBeenCalled();
  });

  it("provisions immediately when Auth already confirms the email (existing/auto-confirm)", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockImplementation(() => ({ insert }));

    signUp.mockResolvedValue({
      data: {
        user: {
          id: "ready-1",
          email: "ready@example.com",
          email_confirmed_at: "2026-11-19T00:00:00Z",
          identities: [{ provider: "email" }],
        },
        session: { access_token: "tok" },
      },
      error: null,
    });

    const result = await signupLearner({
      fullName: "Ready Learner",
      email: "ready@example.com",
      password: "Password1!",
    });

    expect(result.needsEmailVerification).toBe(false);
    expect(from).toHaveBeenCalled();
    expect(insert).toHaveBeenCalled();
  });

  it("rejects duplicate accounts without creating a second profile", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        message: "User already registered",
        code: "user_already_exists",
        status: 422,
      },
    });

    await expect(
      signupLearner({
        fullName: "Existing",
        email: "exists@example.com",
        password: "Password1!",
      }),
    ).rejects.toThrow(/already exists/i);
    expect(from).not.toHaveBeenCalled();
  });
});

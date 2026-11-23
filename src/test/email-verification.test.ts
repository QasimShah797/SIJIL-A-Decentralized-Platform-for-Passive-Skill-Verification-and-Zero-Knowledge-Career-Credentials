import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const verifyOtp = vi.fn();
const resend = vi.fn();
const getUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      resend: (...args: unknown[]) => resend(...args),
      getUser: (...args: unknown[]) => getUser(...args),
    },
  },
}));

import {
  OTP_RESEND_COOLDOWN_MS,
  classifyOtpAuthError,
  clearPendingSignupEmail,
  isEmailNotConfirmedAuthError,
  isEmailVerifiedUser,
  isValidOtpCode,
  maskEmail,
  readPendingSignupEmail,
  rememberPendingSignupEmail,
  resendSignupEmailOtp,
  verifySignupEmailOtp,
} from "@/lib/email-verification";

function user(partial: Partial<User> & { id?: string }): User {
  return {
    id: partial.id ?? "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...partial,
  } as User;
}

describe("email verification helpers", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    resend.mockReset();
    getUser.mockReset();
    clearPendingSignupEmail();
    sessionStorage.clear();
  });

  it("treats email_confirmed_at as verified", () => {
    expect(isEmailVerifiedUser(user({ email_confirmed_at: "2026-01-01T00:00:00Z" }))).toBe(true);
  });

  it("treats OAuth identities as verified without email_confirmed_at", () => {
    expect(
      isEmailVerifiedUser(
        user({
          email_confirmed_at: null as unknown as undefined,
          identities: [{ provider: "google", id: "g1", user_id: "user-1", identity_id: "i1", identity_data: {}, created_at: "", last_sign_in_at: "", updated_at: "" }],
        }),
      ),
    ).toBe(true);
  });

  it("denies unverified email/password users", () => {
    expect(
      isEmailVerifiedUser(
        user({
          email_confirmed_at: undefined,
          identities: [{ provider: "email", id: "e1", user_id: "user-1", identity_id: "i1", identity_data: {}, created_at: "", last_sign_in_at: "", updated_at: "" }],
        }),
      ),
    ).toBe(false);
  });

  it("masks emails for display", () => {
    expect(maskEmail("learner@example.com")).toBe("l***@example.com");
  });

  it("validates six-digit OTP shape", () => {
    expect(isValidOtpCode("123456")).toBe(true);
    expect(isValidOtpCode("12a456")).toBe(false);
    expect(isValidOtpCode("12345")).toBe(false);
  });

  it("stores pending signup email in sessionStorage only (never OTP)", () => {
    rememberPendingSignupEmail("Learner@Example.com");
    expect(readPendingSignupEmail()).toBe("learner@example.com");
    expect(sessionStorage.getItem("sijil.pendingSignupEmail")).toBe("learner@example.com");
  });

  it("classifies invalid, expired, used, and rate-limit OTP errors", () => {
    expect(classifyOtpAuthError({ message: "Token has expired or is invalid" }).kind).toBe("expired");
    expect(classifyOtpAuthError({ message: "Invalid OTP" }).kind).toBe("invalid");
    expect(classifyOtpAuthError({ message: "Token has already been used" }).kind).toBe("already_used");
    expect(classifyOtpAuthError({ message: "email rate limit exceeded", status: 429 }).kind).toBe("rate_limit");
  });

  it("detects email-not-confirmed sign-in errors", () => {
    expect(isEmailNotConfirmedAuthError({ message: "Email not confirmed", code: "email_not_confirmed" })).toBe(true);
    expect(isEmailNotConfirmedAuthError({ message: "Invalid login credentials" })).toBe(false);
  });

  it("verifies a successful signup OTP without logging the token", async () => {
    const verified = user({
      id: "user-42",
      email: "learner@example.com",
      email_confirmed_at: "2026-11-19T00:00:00Z",
    });
    verifyOtp.mockResolvedValue({ data: { user: verified, session: {} }, error: null });

    const result = await verifySignupEmailOtp("learner@example.com", "123456");
    expect(result.id).toBe("user-42");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "learner@example.com",
      token: "123456",
      type: "signup",
    });
  });

  it("maps invalid OTP failures to a friendly error", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid OTP", status: 401 },
    });
    await expect(verifySignupEmailOtp("learner@example.com", "000000")).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  it("maps expired OTP failures to a friendly error", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "OTP has expired", code: "otp_expired" },
    });
    await expect(verifySignupEmailOtp("learner@example.com", "111111")).rejects.toMatchObject({
      kind: "expired",
    });
  });

  it("resends signup OTP and surfaces rate limits", async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    await resendSignupEmailOtp("learner@example.com");
    expect(resend).toHaveBeenCalledWith({ type: "signup", email: "learner@example.com" });

    resend.mockResolvedValue({
      data: {},
      error: { message: "For security purposes, you can only request this after 60 seconds.", status: 429 },
    });
    await expect(resendSignupEmailOtp("learner@example.com")).rejects.toMatchObject({
      kind: "rate_limit",
    });
    expect(OTP_RESEND_COOLDOWN_MS).toBe(60_000);
  });
});

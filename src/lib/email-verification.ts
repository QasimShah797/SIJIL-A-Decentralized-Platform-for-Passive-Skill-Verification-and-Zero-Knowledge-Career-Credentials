import type { AuthError, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const PENDING_SIGNUP_EMAIL_KEY = "sijil.pendingSignupEmail";
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_LENGTH = 6;

/** Trusted check from Supabase Auth user — never a client-forged boolean. */
export function isEmailVerifiedUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  const identities = user.identities ?? [];
  return identities.some((identity) => {
    const provider = (identity.provider ?? "").toLowerCase();
    return provider.length > 0 && provider !== "email";
  });
}

export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function rememberPendingSignupEmail(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    sessionStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, normalized);
  } catch {
    // sessionStorage may be unavailable; verify page can still use navigation state.
  }
}

export function readPendingSignupEmail(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_SIGNUP_EMAIL_KEY);
    return value?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function clearPendingSignupEmail(): void {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
  } catch {
    // ignore
  }
}

export function isValidOtpCode(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}

export type OtpVerifyErrorKind =
  | "invalid"
  | "expired"
  | "already_used"
  | "rate_limit"
  | "general";

export function classifyOtpAuthError(error: AuthError | { message?: string; code?: string; status?: number }): {
  kind: OtpVerifyErrorKind;
  message: string;
} {
  const msg = error.message ?? "";
  const lower = msg.toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const status = "status" in error ? error.status : undefined;

  if (
    status === 429
    || code.includes("over_email_send_rate_limit")
    || lower.includes("rate limit")
    || lower.includes("too many requests")
    || lower.includes("security purposes")
  ) {
    return {
      kind: "rate_limit",
      message: "Too many attempts. Please wait a minute before trying again.",
    };
  }

  if (
    lower.includes("expired")
    || lower.includes("otp_expired")
    || code === "otp_expired"
  ) {
    return {
      kind: "expired",
      message: "This code has expired. Request a new one and try again.",
    };
  }

  if (
    lower.includes("already been used")
    || lower.includes("already verified")
    || lower.includes("already confirmed")
    || lower.includes("token has already been used")
  ) {
    return {
      kind: "already_used",
      message: "This code was already used. Sign in, or request a new code if needed.",
    };
  }

  if (
    lower.includes("invalid")
    || lower.includes("token")
    || code === "otp_disabled"
    || status === 401
    || status === 403
  ) {
    return {
      kind: "invalid",
      message: "That code is incorrect. Check the email and try again.",
    };
  }

  return {
    kind: "general",
    message: msg || "Could not verify the code. Please try again.",
  };
}

/** Verify signup OTP via Supabase Auth. Never log the token. */
export async function verifySignupEmailOtp(email: string, token: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.trim();

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw Object.assign(new Error("Enter the email you used to sign up."), { kind: "general" as const });
  }
  if (!isValidOtpCode(normalizedToken)) {
    throw Object.assign(new Error("Enter the 6-digit code from your email."), { kind: "invalid" as const });
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "signup",
  });

  if (error) {
    const classified = classifyOtpAuthError(error);
    throw Object.assign(new Error(classified.message), { kind: classified.kind });
  }

  const user = data.user;
  if (!user) {
    throw Object.assign(new Error("Verification succeeded but no user session was returned."), {
      kind: "general" as const,
    });
  }

  if (!isEmailVerifiedUser(user)) {
    // Prefer a fresh Auth user object over trusting the verify response alone.
    const { data: fresh, error: freshError } = await supabase.auth.getUser();
    if (freshError || !isEmailVerifiedUser(fresh.user)) {
      throw Object.assign(new Error("Email is still unverified. Request a new code and try again."), {
        kind: "general" as const,
      });
    }
    clearPendingSignupEmail();
    return fresh.user;
  }

  clearPendingSignupEmail();
  return user;
}

export async function resendSignupEmailOtp(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw Object.assign(new Error("Enter the email you used to sign up."), { kind: "general" as const });
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
  });

  if (error) {
    const classified = classifyOtpAuthError(error);
    throw Object.assign(new Error(classified.message), { kind: classified.kind });
  }
}

export function isEmailNotConfirmedAuthError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const lower = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  return (
    code === "email_not_confirmed"
    || lower.includes("email not confirmed")
    || lower.includes("confirm your email")
    || lower.includes("email address not confirmed")
  );
}

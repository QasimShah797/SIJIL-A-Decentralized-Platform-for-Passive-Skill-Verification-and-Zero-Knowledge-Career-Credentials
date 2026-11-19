import { supabase } from "@/integrations/supabase/client";
import { isMissingColumnError, stripNonDbColumns } from "@/lib/db/learner-profile-columns";
import {
  isEmailVerifiedUser,
  rememberPendingSignupEmail,
} from "@/lib/email-verification";

export type LearnerSignupInput = {
  fullName: string;
  email: string;
  password: string;
  institutionName?: string;
  program?: string;
};

export type LearnerSignupResult = {
  userId: string;
  email: string;
  needsEmailVerification: boolean;
};

export type SignupFieldError = "email" | "password" | "fullName" | "general";

export class LearnerSignupError extends Error {
  field: SignupFieldError;
  /** When true, UI must not automatically call signUp again. */
  recoveryHint: boolean;

  constructor(message: string, field: SignupFieldError = "general", recoveryHint = false) {
    super(message);
    this.name = "LearnerSignupError";
    this.field = field;
    this.recoveryHint = recoveryHint;
  }
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Pull a human string from Auth / fetch errors. Never returns "{}" or object dumps. */
export function extractAuthErrorMessage(error: unknown): string {
  if (error == null) return "";

  if (typeof error === "string") {
    return sanitizeAuthErrorText(error);
  }

  if (error instanceof Error) {
    const fromError = sanitizeAuthErrorText(error.message);
    if (fromError) return fromError;
  }

  if (typeof error === "object") {
    const row = error as {
      message?: unknown;
      msg?: unknown;
      error_description?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    for (const candidate of [row.message, row.msg, row.error_description, row.error, row.details, row.hint]) {
      if (typeof candidate === "string") {
        const text = sanitizeAuthErrorText(candidate);
        if (text) return text;
      }
    }
  }

  // Never JSON.stringify the whole Error — empty Auth bodies become "{}" in auth-js.
  return "";
}

export function sanitizeAuthErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (
    trimmed === "{}"
    || trimmed === "[]"
    || trimmed === "null"
    || trimmed === "undefined"
    || lower === "[object object]"
    || lower === "[object error]"
  ) {
    return "";
  }
  return trimmed;
}

export function isSignupNetworkFailure(error: unknown): boolean {
  if (error == null) return false;
  const row = error as { message?: string; status?: number; name?: string };
  const msg = extractAuthErrorMessage(error).toLowerCase();
  const name = (row.name ?? (error instanceof Error ? error.name : "")).toLowerCase();
  const status = typeof row.status === "number" ? row.status : undefined;

  return (
    status === 0
    || name.includes("authretryablefetcherror")
    || msg === "failed to fetch"
    || msg.includes("networkerror")
    || msg.includes("network request failed")
    || msg.includes("load failed")
    || msg.includes("fetch failed")
    || (name === "typeerror" && msg.includes("fetch"))
  );
}

export function isSignupMailerFailure(error: unknown): boolean {
  const msg = extractAuthErrorMessage(error).toLowerCase();
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code ?? "").toLowerCase()
    : "";
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: number }).status)
    : undefined;

  return (
    code.includes("email")
    || msg.includes("error sending")
    || msg.includes("confirmation email")
    || msg.includes("smtp")
    || msg.includes("mail")
    || (status != null && status >= 500 && status <= 530 && !extractAuthErrorMessage(error))
  );
}

const RECOVERY_MESSAGE =
  "Signup may have already created your account. Do not sign up again. Open Verify email and enter the code, or use Resend code. If no email arrives, check Supabase Auth logs and Gmail SMTP.";

export function parseAuthSignupError(error: unknown): LearnerSignupError {
  const msg = extractAuthErrorMessage(error);
  const lower = msg.toLowerCase();
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code ?? "")
    : "";
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: number }).status)
    : undefined;
  const name = typeof error === "object" && error && "name" in error
    ? String((error as { name?: string }).name ?? "")
    : error instanceof Error
      ? error.name
      : "";

  if (isSignupNetworkFailure(error) || name === "AuthRetryableFetchError") {
    return new LearnerSignupError(
      `Could not finish signup (network/Auth timeout${status != null ? `, status ${status}` : ""}). ${RECOVERY_MESSAGE}`,
      "general",
      true,
    );
  }

  if (isSignupMailerFailure(error) || (!msg && status != null && status >= 500)) {
    const meta = [status != null ? `status ${status}` : "", code].filter(Boolean).join(", ");
    return new LearnerSignupError(
      `Supabase could not send the confirmation email${meta ? ` (${meta})` : ""}. ${RECOVERY_MESSAGE}`,
      "general",
      true,
    );
  }

  // auth-js uses JSON.stringify(body) when the error body is empty → message "{}"
  if (!msg) {
    const meta = [status != null ? `status ${status}` : "", code || name].filter(Boolean).join(", ");
    return new LearnerSignupError(
      `Sign up failed${meta ? ` (${meta})` : ""}. ${RECOVERY_MESSAGE}`,
      "general",
      true,
    );
  }

  if (
    code === "user_already_exists"
    || lower.includes("already registered")
    || lower.includes("already been registered")
    || lower.includes("user already exists")
    || lower.includes("email address is already")
    || (status === 422 && lower.includes("already"))
  ) {
    return new LearnerSignupError(
      "An account with this email already exists. If it is unverified, open Verify email and enter or resend the code instead of signing up again.",
      "email",
      true,
    );
  }

  if (
    code === "weak_password"
    || (lower.includes("password")
      && (lower.includes("weak")
        || lower.includes("short")
        || lower.includes("at least")
        || lower.includes("characters")))
  ) {
    return new LearnerSignupError(
      "Password is too weak. Use at least 8 characters with a mix of letters and numbers.",
      "password",
    );
  }

  if (
    code === "validation_failed"
    || lower.includes("invalid email")
    || lower.includes("unable to validate email")
    || (lower.includes("is invalid") && lower.includes("email"))
  ) {
    return new LearnerSignupError("Please enter a valid email address.", "email");
  }

  if (status === 422) {
    return new LearnerSignupError(
      msg || "Sign-up details are invalid. Check your email and password.",
      "general",
    );
  }

  return new LearnerSignupError(msg || `Sign up failed. ${RECOVERY_MESSAGE}`, "general", !msg);
}

/** Always returns a plain string safe for toast description. */
export function formatSignupToastError(err: unknown): string {
  if (err instanceof LearnerSignupError) {
    return err.message || RECOVERY_MESSAGE;
  }
  return parseAuthSignupError(err).message;
}

async function insertLearnerProfileRow(
  userId: string,
  firstName: string,
  lastName: string,
  email?: string,
  institutionName?: string,
  program?: string,
): Promise<void> {
  const now = new Date().toISOString();

  const fullPayload = stripNonDbColumns({
    user_id: userId,
    first_name: firstName || "Learner",
    last_name: lastName || "",
    university_email: email?.trim().toLowerCase() || null,
    institution_name: institutionName?.trim() || null,
    program: program?.trim() || null,
    profile_completed: false,
    account_activated_at: now,
  });

  const minimalPayload = stripNonDbColumns({
    user_id: userId,
    first_name: firstName || "Learner",
    last_name: lastName || "",
    profile_completed: false,
  });

  const { error: fullError } = await supabase.from("learner_profiles").insert(fullPayload);
  if (!fullError || isDuplicateDbError(fullError)) return;

  if (!isMissingColumnError(fullError)) {
    throw new LearnerSignupError(
      "Could not create learner profile. Please contact support.",
      "general",
    );
  }

  const { error: minimalError } = await supabase.from("learner_profiles").insert(minimalPayload);
  if (minimalError && !isDuplicateDbError(minimalError)) {
    throw new LearnerSignupError(
      "Could not create learner profile. Please contact support.",
      "general",
    );
  }
}

function isDuplicateDbError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505"
    || (error.message?.toLowerCase().includes("duplicate") ?? false)
    || (error.message?.toLowerCase().includes("unique") ?? false)
  );
}

async function ensureLearnerRole(userId: string): Promise<void> {
  const { error } = await supabase.from("user_roles").insert({
    user_id: userId,
    role: "learner",
  });

  if (!error || isDuplicateDbError(error)) return;

  throw new LearnerSignupError("Could not assign learner role. Please contact support.", "general");
}

/**
 * Create Auth user via Supabase. Role/profile are created only after email is verified
 * (or immediately when Auth already marks the email confirmed, e.g. confirmations disabled).
 * Does not automatically retry on network/mailer failure.
 */
export async function signupLearner(input: LearnerSignupInput): Promise<LearnerSignupResult> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(input.fullName);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LearnerSignupError("Please enter a valid email address.", "email");
  }

  if (input.password.length < 8) {
    throw new LearnerSignupError("Password must be at least 8 characters.", "password");
  }

  const redirectTo = `${window.location.origin}/signup/learner/verify-email`;

  let authData: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
  let authError: Awaited<ReturnType<typeof supabase.auth.signUp>>["error"];
  try {
    ({ data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { full_name: input.fullName.trim() },
        emailRedirectTo: redirectTo,
      },
    }));
  } catch (err) {
    // Single attempt only — never auto-retry signup after network/SMTP failures.
    throw parseAuthSignupError(err);
  }

  if (authError) {
    throw parseAuthSignupError(authError);
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new LearnerSignupError("Account creation failed. Please try again.", "general");
  }

  // Confirm email ON → usually no session until OTP verify. Defer role/profile.
  const verified = isEmailVerifiedUser(authData.user);
  if (!verified || !authData.session) {
    rememberPendingSignupEmail(email);
    return { userId, email, needsEmailVerification: true };
  }

  await ensureLearnerRole(userId);
  await insertLearnerProfileRow(
    userId,
    firstName,
    lastName,
    email,
    input.institutionName,
    input.program,
  );

  return { userId, email, needsEmailVerification: false };
}

/** Bootstrap learner role + profile after OTP verification (idempotent). */
export async function completeLearnerSignupAfterEmailVerification(userId: string): Promise<void> {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user || userData.user.id !== userId) {
    throw new LearnerSignupError("Your session expired. Please verify again or sign in.", "general");
  }
  if (!isEmailVerifiedUser(userData.user)) {
    throw new LearnerSignupError("Confirm your email before continuing.", "email");
  }

  const metaName = String(userData.user.user_metadata?.full_name ?? "").trim();
  const email = userData.user.email?.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(metaName || email?.split("@")[0] || "Learner");

  await ensureLearnerRole(userId);
  await insertLearnerProfileRow(userId, firstName, lastName, email);
}

/** Bootstrap learner role + profile for a Google/GitHub OAuth user. */
export async function provisionOAuthLearner(
  userId: string,
  fullName: string,
  email?: string | null,
): Promise<void> {
  const { firstName, lastName } = splitFullName(fullName);
  await ensureLearnerRole(userId);
  await insertLearnerProfileRow(userId, firstName, lastName, email ?? undefined);
}

import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { holderDidFromUserId } from "@/lib/did";
import { isMissingColumnError, stripNonDbColumns } from "@/lib/db/learner-profile-columns";

export type LearnerSignupInput = {
  fullName: string;
  email: string;
  password: string;
  institutionName?: string;
  program?: string;
};

export type SignupFieldError = "email" | "password" | "fullName" | "general";

export class LearnerSignupError extends Error {
  field: SignupFieldError;

  constructor(message: string, field: SignupFieldError = "general") {
    super(message);
    this.name = "LearnerSignupError";
    this.field = field;
  }
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function parseAuthSignupError(error: AuthError): LearnerSignupError {
  const msg = error.message ?? "";
  const lower = msg.toLowerCase();
  const code = error.code ?? "";

  if (
    code === "user_already_exists" ||
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists") ||
    lower.includes("email address is already") ||
    error.status === 422 && lower.includes("already")
  ) {
    return new LearnerSignupError(
      "An account with this email already exists. Please sign in instead.",
      "email",
    );
  }

  if (
    code === "weak_password" ||
    (lower.includes("password") &&
      (lower.includes("weak") ||
        lower.includes("short") ||
        lower.includes("at least") ||
        lower.includes("characters")))
  ) {
    return new LearnerSignupError(
      "Password is too weak. Use at least 8 characters with a mix of letters and numbers.",
      "password",
    );
  }

  if (
    code === "validation_failed" ||
    lower.includes("invalid email") ||
    lower.includes("unable to validate email") ||
    lower.includes("is invalid") && lower.includes("email")
  ) {
    return new LearnerSignupError("Please enter a valid email address.", "email");
  }

  if (error.status === 422) {
    return new LearnerSignupError(
      msg || "Sign-up details are invalid. Check your email and password.",
      "general",
    );
  }

  return new LearnerSignupError(msg || "Sign up failed. Please try again.", "general");
}

async function insertLearnerProfileRow(
  userId: string,
  firstName: string,
  lastName: string,
  institutionName?: string,
  program?: string,
): Promise<void> {
  const holderDid = holderDidFromUserId(userId);
  const now = new Date().toISOString();

  const fullPayload = stripNonDbColumns({
    user_id: userId,
    first_name: firstName || "Learner",
    last_name: lastName || "",
    institution_name: institutionName?.trim() || null,
    program: program?.trim() || null,
    holder_did: holderDid,
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
  if (!fullError) return;

  if (!isMissingColumnError(fullError)) {
    throw new LearnerSignupError(
      "Could not create learner profile. Please contact support.",
      "general",
    );
  }

  const { error: minimalError } = await supabase.from("learner_profiles").insert(minimalPayload);
  if (minimalError) {
    throw new LearnerSignupError(
      "Could not create learner profile. Please contact support.",
      "general",
    );
  }
}

async function ensureLearnerRole(userId: string): Promise<void> {
  const { error } = await supabase.from("user_roles").insert({
    user_id: userId,
    role: "learner",
  });

  if (!error) return;

  const duplicate =
    error.code === "23505" ||
    error.message?.toLowerCase().includes("duplicate") ||
    error.message?.toLowerCase().includes("unique");

  if (duplicate) return;

  throw new LearnerSignupError("Could not assign learner role. Please contact support.", "general");
}

/** Create a learner-owned SIJIL account via Supabase Auth + profile bootstrap. */
export async function signupLearner(input: LearnerSignupInput): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitFullName(input.fullName);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new LearnerSignupError("Please enter a valid email address.", "email");
  }

  if (input.password.length < 8) {
    throw new LearnerSignupError("Password must be at least 8 characters.", "password");
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim() },
    },
  });

  if (authError) {
    throw parseAuthSignupError(authError);
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new LearnerSignupError("Account creation failed. Please try again.", "general");
  }

  if (!authData.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (signInError) {
      throw new LearnerSignupError(
        "Account created. Please check your email to confirm your address, then sign in.",
        "email",
      );
    }
  }

  await ensureLearnerRole(userId);
  await insertLearnerProfileRow(userId, firstName, lastName, input.institutionName, input.program);

  return { userId };
}

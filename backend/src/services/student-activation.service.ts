/**
 * Student activation — validate token, set password (service role), mark account activated.
 */
import { createHash } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import type { ActivateStudentInput } from "../validators/student-activation.validator";

export type ActivationPreview = {
  fullName: string;
  universityEmail: string;
  registrationNumber: string;
  institutionName: string;
  department: string;
  program: string;
  batchSemester: string;
  expiresAt: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  institution_id: string;
  expires_at: string;
  used_at: string | null;
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function resolveValidToken(rawToken: string): Promise<TokenRow> {
  const supabase = getServiceSupabase();
  const tokenHash = hashToken(rawToken);

  const { data, error } = await supabase
    .from("student_activation_tokens")
    .select("id, user_id, institution_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AppError("Invalid or expired activation link", 400);
  }
  if (data.used_at) {
    throw new AppError("This activation link has already been used", 400);
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new AppError("This activation link has expired", 400);
  }

  return data;
}

async function loadStudentPreview(userId: string, institutionId: string): Promise<ActivationPreview> {
  const supabase = getServiceSupabase();

  const { data: learner, error: learnerError } = await supabase
    .from("learner_profiles")
    .select(
      "first_name, last_name, university_email, student_id, department, program, batch, institution_name, account_activated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (learnerError) throw learnerError;
  if (!learner?.university_email) {
    throw new AppError("Student profile not found for this activation link", 404);
  }
  if (learner.account_activated_at) {
    throw new AppError("This student account is already activated. Sign in at learner login.", 400);
  }

  let institutionName = learner.institution_name ?? "";
  if (!institutionName) {
    const { data: inst } = await supabase
      .from("institution_profiles")
      .select("institution_name")
      .eq("user_id", institutionId)
      .maybeSingle();
    institutionName = inst?.institution_name ?? "";
  }

  const fullName = [learner.first_name, learner.last_name].filter(Boolean).join(" ").trim();

  return {
    fullName,
    universityEmail: learner.university_email,
    registrationNumber: learner.student_id ?? "",
    institutionName,
    department: learner.department ?? "",
    program: learner.program ?? "",
    batchSemester: learner.batch ?? "",
    expiresAt: "",
  };
}

export const studentActivationService = {
  async preview(rawToken: string): Promise<ActivationPreview> {
    const token = await resolveValidToken(rawToken);
    const preview = await loadStudentPreview(token.user_id, token.institution_id);
    return { ...preview, expiresAt: token.expires_at };
  },

  async activate(input: ActivateStudentInput): Promise<{ universityEmail: string }> {
    const token = await resolveValidToken(input.token);
    const preview = await loadStudentPreview(token.user_id, token.institution_id);
    const supabase = getServiceSupabase();
    const now = new Date().toISOString();

    const { error: authError } = await supabase.auth.admin.updateUserById(token.user_id, {
      password: input.password,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { error: profileError } = await supabase
      .from("learner_profiles")
      .update({ account_activated_at: now })
      .eq("user_id", token.user_id);
    if (profileError) throw profileError;

    const { error: tokenError } = await supabase
      .from("student_activation_tokens")
      .update({ used_at: now })
      .eq("id", token.id);
    if (tokenError) throw tokenError;

    return { universityEmail: preview.universityEmail };
  },
};

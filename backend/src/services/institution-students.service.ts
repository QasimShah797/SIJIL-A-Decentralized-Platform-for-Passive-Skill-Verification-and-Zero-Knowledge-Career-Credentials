/**
 * Institution student provisioning — service role creates auth users and activation tokens.
 */
import { createHash, randomBytes } from "node:crypto";
import { getServiceSupabase } from "../config/supabase";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import type { CreateInstitutionStudentInput } from "../validators/institution-students.validator";

const TOKEN_TTL_DAYS = 7;

export type InstitutionStudentRow = {
  userId: string;
  fullName: string;
  universityEmail: string;
  registrationNumber: string;
  department: string;
  program: string;
  batchSemester: string;
  status: string;
  statusLabel: string;
  accountActivated: boolean;
  createdAt: string;
};

export type CreateInstitutionStudentResult = InstitutionStudentRow & {
  activationLink: string;
  activationExpiresAt: string;
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function getActiveInstitution(institutionUserId: string) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("institution_profiles")
    .select("user_id, institution_name, status")
    .eq("user_id", institutionUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status !== "active") {
    throw new AppError("Institution account is not active", 403);
  }
  return data;
}

async function assertUniversityEmailAvailable(email: string): Promise<void> {
  const supabase = getServiceSupabase();
  const normalized = email.toLowerCase();

  const existingAuth = await findAuthUserIdByEmail(normalized);
  if (existingAuth) {
    throw new AppError("A user with this university email already exists", 409);
  }

  const { data, error } = await supabase
    .from("learner_profiles")
    .select("user_id")
    .ilike("university_email", normalized)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    throw new AppError("This university email is already registered to a student", 409);
  }
}

async function assertRegistrationNumberAvailable(
  institutionId: string,
  registrationNumber: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("learner_profiles")
    .select("user_id")
    .eq("institution_id", institutionId)
    .eq("student_id", registrationNumber)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    throw new AppError(
      "This registration number is already used for a student at your institution",
      409,
    );
  }
}

function mapStudentRow(row: {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  university_email: string | null;
  student_id: string | null;
  department: string | null;
  program: string | null;
  batch: string | null;
  status: string | null;
  account_activated_at: string | null;
  created_at: string;
}): InstitutionStudentRow {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  const verified = row.status === "verified";
  return {
    userId: row.user_id,
    fullName,
    universityEmail: row.university_email ?? "",
    registrationNumber: row.student_id ?? "",
    department: row.department ?? "",
    program: row.program ?? "",
    batchSemester: row.batch ?? "",
    status: row.status ?? "verified",
    statusLabel: verified ? "Verified Student" : (row.status ?? "pending"),
    accountActivated: Boolean(row.account_activated_at),
    createdAt: row.created_at,
  };
}

export const institutionStudentsService = {
  async listStudents(institutionUserId: string): Promise<InstitutionStudentRow[]> {
    await getActiveInstitution(institutionUserId);
    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from("learner_profiles")
      .select(
        "user_id, first_name, last_name, university_email, student_id, department, program, batch, status, account_activated_at, created_at",
      )
      .eq("institution_id", institutionUserId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapStudentRow);
  },

  async createStudent(
    institutionUserId: string,
    input: CreateInstitutionStudentInput,
  ): Promise<CreateInstitutionStudentResult> {
    const institution = await getActiveInstitution(institutionUserId);
    const email = input.universityEmail.trim().toLowerCase();
    const registrationNumber = input.registrationNumber.trim();

    await assertUniversityEmailAvailable(email);
    await assertRegistrationNumberAvailable(institutionUserId, registrationNumber);

    const supabase = getServiceSupabase();
    const { firstName, lastName } = splitFullName(input.fullName);
    const placeholderPassword = randomBytes(32).toString("hex");

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: placeholderPassword,
      email_confirm: false,
      user_metadata: {
        full_name: input.fullName.trim(),
        provisioned_by_institution: true,
        institution_id: institutionUserId,
      },
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes("already")) {
        throw new AppError("A user with this university email already exists", 409);
      }
      throw authError;
    }

    const userId = authData.user.id;

    try {
      const { error: profileError } = await supabase.from("profiles").upsert(
        { id: userId, display_name: input.fullName.trim() },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      const { error: roleError } = await supabase.from("user_roles").upsert(
        { user_id: userId, role: "learner" },
        { onConflict: "user_id,role" },
      );
      if (roleError) throw roleError;

      const { error: learnerError } = await supabase.from("learner_profiles").insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        university_email: email,
        student_id: registrationNumber,
        department: input.department.trim(),
        program: input.program.trim(),
        batch: input.batchSemester.trim(),
        institution_id: institutionUserId,
        institution_name: institution.institution_name,
        status: "verified",
        profile_completed: false,
      });
      if (learnerError) {
        if (learnerError.code === "23505") {
          throw new AppError(
            "Duplicate university email or registration number for this institution",
            409,
          );
        }
        throw learnerError;
      }

      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS);

      const { error: tokenError } = await supabase.from("student_activation_tokens").insert({
        user_id: userId,
        institution_id: institutionUserId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });
      if (tokenError) throw tokenError;

      const activationLink = `${env.FRONTEND_URL.replace(/\/$/, "")}/student/activate?token=${encodeURIComponent(rawToken)}`;

      const { data: created, error: fetchError } = await supabase
        .from("learner_profiles")
        .select(
          "user_id, first_name, last_name, university_email, student_id, department, program, batch, status, account_activated_at, created_at",
        )
        .eq("user_id", userId)
        .single();

      if (fetchError || !created) throw fetchError ?? new Error("Failed to load created student");

      return {
        ...mapStudentRow(created),
        activationLink,
        activationExpiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await supabase.auth.admin.deleteUser(userId);
      throw err;
    }
  },
};

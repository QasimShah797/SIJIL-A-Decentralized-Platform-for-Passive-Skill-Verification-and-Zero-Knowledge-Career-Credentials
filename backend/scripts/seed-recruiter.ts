/**
 * Create or update a recruiter account with working login (Supabase Admin API).
 *
 * Setup once — create backend/.env from .env.example with service_role key.
 *
 * Add NEW recruiter (from backend/):
 *   RECRUITER_EMAIL=recruiter@cust.edu.pk RECRUITER_PASSWORD=CustRecruit2026! npm run seed:recruiter
 *
 * PowerShell:
 *   $env:RECRUITER_EMAIL="recruiter@cust.edu.pk"
 *   $env:RECRUITER_PASSWORD="CustRecruit2026!"
 *   npm run seed:recruiter
 */
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const RECRUITER = {
  userId: process.env.RECRUITER_USER_ID?.trim() || "",
  email: process.env.RECRUITER_EMAIL?.trim().toLowerCase() || "recruiter@cust.edu.pk",
  password: process.env.RECRUITER_PASSWORD?.trim() || "CustRecruit2026!",
  fullName: process.env.RECRUITER_FULL_NAME?.trim() || "Recruiter CUST",
  companyName: process.env.RECRUITER_COMPANY?.trim() || "Capital University of Science & Technology",
  jobTitle: process.env.RECRUITER_JOB_TITLE?.trim() || "Recruiter",
  role: "recruiter" as const,
  verificationStatus: "verified" as const,
};

function requireEnv(): { url: string; serviceKey: string; anonKey: string } {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url) {
    console.error("Missing SUPABASE_URL in backend/.env");
    process.exit(1);
  }
  if (!serviceKey || serviceKey.includes("PASTE_") || serviceKey.includes("your_service_role")) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in backend/.env\n" +
        "  Supabase Dashboard → Project Settings → API → service_role (secret)",
    );
    process.exit(1);
  }
  if (!anonKey) {
    console.error("Missing SUPABASE_ANON_KEY in backend/.env");
    process.exit(1);
  }

  return { url, serviceKey, anonKey };
}

function serviceClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof serviceClient>,
  email: string,
): Promise<string | null> {
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

async function upsertAuthUser(
  supabase: ReturnType<typeof serviceClient>,
  email: string,
): Promise<string> {
  const metadata = { full_name: RECRUITER.fullName };

  let userId = RECRUITER.userId || (await findUserIdByEmail(supabase, email));

  if (userId) {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      email,
      password: RECRUITER.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    console.log("Updated existing auth user:", data.user.id);
    return data.user.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: RECRUITER.password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (error) {
    const retryId = await findUserIdByEmail(supabase, email);
    if (retryId) {
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(retryId, {
        email,
        password: RECRUITER.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (updateError) throw updateError;
      console.log("Created/updated auth user (retry):", updated.user.id);
      return updated.user.id;
    }
    throw error;
  }

  console.log("Created new auth user:", data.user.id);
  return data.user.id;
}

async function upsertRecruiterRows(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  email: string,
): Promise<void> {
  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: userId, display_name: RECRUITER.fullName },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { error: roleError } = await supabase.from("user_roles").upsert(
    { user_id: userId, role: RECRUITER.role },
    { onConflict: "user_id,role" },
  );
  if (roleError) throw roleError;

  const { error: recruiterError } = await supabase.from("recruiter_profiles").upsert(
    {
      user_id: userId,
      full_name: RECRUITER.fullName,
      work_email: email,
      company_name: RECRUITER.companyName,
      job_title: RECRUITER.jobTitle,
      verification_status: RECRUITER.verificationStatus,
    },
    { onConflict: "user_id" },
  );
  if (recruiterError) throw recruiterError;
}

async function verifyLogin(url: string, anonKey: string, email: string): Promise<void> {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: RECRUITER.password,
  });
  if (error || !data.user) {
    throw new Error(`Login verification failed: ${error?.message ?? "no user returned"}`);
  }
  await anon.auth.signOut();
  console.log("Login verification passed.");
}

async function main() {
  const { url, serviceKey, anonKey } = requireEnv();
  console.log(`Remote Supabase: ${new URL(url).hostname}`);
  console.log(`Recruiter email: ${RECRUITER.email}\n`);

  const supabase = serviceClient(url, serviceKey);
  const userId = await upsertAuthUser(supabase, RECRUITER.email);
  await upsertRecruiterRows(supabase, userId, RECRUITER.email);
  await verifyLogin(url, anonKey, RECRUITER.email);

  console.log("\nRecruiter ready.");
  console.log("  User ID: ", userId);
  console.log("  Email:   ", RECRUITER.email);
  console.log("  Password:", RECRUITER.password);
  console.log("\nSign in: http://localhost:8080/login/recruiter");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

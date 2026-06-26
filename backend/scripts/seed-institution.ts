/**
 * Backend-only seed: provision institution account on remote Supabase (service role).
 *
 * Does NOT use Docker or local Supabase containers.
 *
 * Prerequisites:
 *   1. backend/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   2. Run once in Supabase Dashboard → SQL Editor (if not already applied):
 *      ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';
 *
 * Usage (from backend/):
 *   npm run seed:institution
 */
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const INSTITUTION = {
  name: "Capital University of Science & Technology",
  shortName: "CUST",
  email: "institution@cust.edu.pk",
  password: "CUST@Sijil2026!",
  role: "institution" as const,
  status: "active" as const,
  domain: "cust.edu.pk",
};

const ACTIVE_ENUM_SQL =
  "ALTER TYPE public.institution_status ADD VALUE IF NOT EXISTS 'active';";

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
        "  Supabase Dashboard → Project Settings → API → service_role (secret)\n" +
        "  Never put this key in the frontend .env",
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

function isActiveStatusError(err: { message?: string; code?: string }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "22P02" ||
    msg.includes("invalid input value for enum") ||
    msg.includes("institution_status")
  );
}

async function upsertAuthUser(
  supabase: ReturnType<typeof serviceClient>,
  email: string,
): Promise<string> {
  const existingId = await findUserIdByEmail(supabase, email);
  const metadata = {
    display_name: INSTITUTION.name,
    institution_short_name: INSTITUTION.shortName,
  };

  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: INSTITUTION.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    console.log("Auth user exists — password and metadata updated:", existingId);
    return existingId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: INSTITUTION.password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (error) {
    const retryId = await findUserIdByEmail(supabase, email);
    if (retryId) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(retryId, {
        password: INSTITUTION.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (updateError) throw updateError;
      console.log("Auth user exists (race) — password and metadata updated:", retryId);
      return retryId;
    }
    throw error;
  }

  console.log("Created auth user:", data.user.id);
  return data.user.id;
}

async function upsertInstitutionRows(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  email: string,
): Promise<void> {
  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: userId, display_name: INSTITUTION.name },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { error: roleError } = await supabase.from("user_roles").upsert(
    { user_id: userId, role: INSTITUTION.role },
    { onConflict: "user_id,role" },
  );
  if (roleError) throw roleError;

  const { error: instError } = await supabase.from("institution_profiles").upsert(
    {
      user_id: userId,
      institution_name: INSTITUTION.name,
      official_email: email,
      contact_email: email,
      domain: INSTITUTION.domain,
      status: INSTITUTION.status,
    },
    { onConflict: "user_id" },
  );

  if (instError) {
    if (isActiveStatusError(instError)) {
      console.error(
        "\nThe database does not have institution_status value 'active' yet.\n" +
          "Run this once in Supabase Dashboard → SQL Editor (remote project, no Docker):\n\n" +
          `  ${ACTIVE_ENUM_SQL}\n\n` +
          "Then run: npm run seed:institution\n",
      );
      process.exit(1);
    }
    throw instError;
  }
}

async function verifyLogin(url: string, anonKey: string, email: string): Promise<void> {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: INSTITUTION.password,
  });
  if (error || !data.user) {
    throw new Error(`Login verification failed: ${error?.message ?? "no user returned"}`);
  }
  await anon.auth.signOut();
  console.log("Login verification passed (signInWithPassword OK).");
}

async function main() {
  const { url, serviceKey, anonKey } = requireEnv();
  const host = new URL(url).hostname;
  console.log(`Remote Supabase: ${host}`);
  console.log(`Seeding institution: ${INSTITUTION.email}\n`);

  const supabase = serviceClient(url, serviceKey);
  const email = INSTITUTION.email.toLowerCase();

  const userId = await upsertAuthUser(supabase, email);
  await upsertInstitutionRows(supabase, userId, email);
  await verifyLogin(url, anonKey, email);

  console.log("\nInstitution seed complete.");
  console.log("  Name:       ", INSTITUTION.name);
  console.log("  Short name: ", INSTITUTION.shortName);
  console.log("  Email:      ", email);
  console.log("  Role:       ", INSTITUTION.role);
  console.log("  Status:     ", INSTITUTION.status);
  console.log("  Domain:     ", INSTITUTION.domain);
  console.log("\nSign in at: http://localhost:8080/login/institution");
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

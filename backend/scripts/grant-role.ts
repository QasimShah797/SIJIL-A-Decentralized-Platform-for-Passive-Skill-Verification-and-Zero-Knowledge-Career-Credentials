/**
 * Grant reviewer or admin with the service role (replaces any existing role).
 *
 * Usage (from backend/):
 *   npm run grant-role -- user@example.com reviewer
 *   npm run grant-role -- user@example.com admin
 */
import { getServiceSupabase } from "../src/config/supabase";
import { GRANTABLE_OPERATOR_ROLES, isGrantableOperatorRole } from "../src/constants/roles";
import { upsertGrantedRole } from "../src/services/grant-role";

const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3]?.trim().toLowerCase();

if (!email || !role) {
  console.error("Usage: npm run grant-role -- <email> <reviewer|admin>");
  process.exit(1);
}

if (!isGrantableOperatorRole(role)) {
  console.error(
    `Refusing role "${role}". Allowed: ${GRANTABLE_OPERATOR_ROLES.join(", ")}.`,
  );
  process.exit(1);
}

async function findUserIdByEmail(target: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function main(): Promise<void> {
  const userId = await findUserIdByEmail(email!);
  if (!userId) {
    console.error(`No auth user found for ${email}`);
    process.exit(1);
  }

  await upsertGrantedRole(getServiceSupabase(), userId, role);
  console.log(`Granted ${role} to ${email} (${userId})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

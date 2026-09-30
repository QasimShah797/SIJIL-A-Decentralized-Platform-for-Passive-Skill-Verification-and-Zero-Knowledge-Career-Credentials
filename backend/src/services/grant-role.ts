/**
 * Replace the caller's app role with reviewer or admin (one row per user_id).
 */
import { isGrantableOperatorRole } from "../constants/roles";
import { AppError } from "../utils/AppError";

export interface GrantedRoleRow {
  user_id: string;
  role: string;
}

export interface RoleTableClient {
  from(table: "user_roles" | string): {
    upsert: (
      row: GrantedRoleRow,
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
}

export async function upsertGrantedRole(
  client: RoleTableClient,
  userId: string,
  role: string,
): Promise<void> {
  if (!isGrantableOperatorRole(role)) {
    throw new AppError(`Refusing role "${role}"`, 400);
  }
  const { error } = await client.from("user_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id" },
  );
  if (error) throw new AppError(error.message, 500);
}

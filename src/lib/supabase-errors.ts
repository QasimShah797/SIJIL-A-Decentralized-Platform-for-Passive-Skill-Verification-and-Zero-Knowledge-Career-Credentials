import { formatSupabaseError } from "@/lib/utils";

/** PostgREST / Postgres errors when a column or table is absent on the remote project. */
export function isMissingColumnError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: string }).code;
    if (code === "PGRST204" || code === "42703") return true;
  }
  const msg = formatSupabaseError(err).toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("does not exist") ||
      msg.includes("not found") ||
      msg.includes("could not find"))
  );
}

export function isMissingRelationError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: string }).code;
    if (code === "PGRST205" || code === "42P01") return true;
    const status = (err as { status?: number }).status;
    if (status === 404) return true;
  }
  const msg = formatSupabaseError(err).toLowerCase();
  return (
    msg.includes("relation") && msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

export function isSchemaMismatchError(err: unknown): boolean {
  return isMissingColumnError(err) || isMissingRelationError(err);
}

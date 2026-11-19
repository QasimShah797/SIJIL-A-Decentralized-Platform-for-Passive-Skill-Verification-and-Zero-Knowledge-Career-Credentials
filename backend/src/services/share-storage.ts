import { AppError } from "../utils/AppError";
import { isMissingRelationError } from "../utils/supabase-errors";

export const SHARE_HISTORY_UNAVAILABLE = "Sharing history temporarily unavailable";
export const SHARE_CREATE_UNAVAILABLE = "A share link could not be created. Please try again.";
export const SHARE_TABLE_UNAVAILABLE = "Sharing is unavailable until the presentations table is applied in Supabase.";
export const SHARE_WRITE_REFUSED = "The share could not be saved because the database refused the write.";

/** Learner-facing storage failure. The original database message is not returned. */
export function shareStorageFailure(kind: "list" | "create"): AppError {
  return new AppError(
    kind === "list" ? SHARE_HISTORY_UNAVAILABLE : SHARE_CREATE_UNAVAILABLE,
    503,
  );
}

/** Classify a presentation write without returning database text to the learner. */
export function shareCreateFailure(error: { message?: string; code?: string } | null | undefined): AppError {
  if (isMissingRelationError(error)) {
    return new AppError(SHARE_TABLE_UNAVAILABLE, 503);
  }
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return new AppError(SHARE_WRITE_REFUSED, 503);
  }
  return shareStorageFailure("create");
}

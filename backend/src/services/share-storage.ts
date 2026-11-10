import { AppError } from "../utils/AppError";

export const SHARE_HISTORY_UNAVAILABLE = "Sharing history temporarily unavailable";
export const SHARE_CREATE_UNAVAILABLE = "A share link could not be created. Please try again.";

/** Learner-facing storage failure. The original database message is not returned. */
export function shareStorageFailure(kind: "list" | "create"): AppError {
  return new AppError(
    kind === "list" ? SHARE_HISTORY_UNAVAILABLE : SHARE_CREATE_UNAVAILABLE,
    503,
  );
}

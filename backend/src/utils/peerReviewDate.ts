const MIN_VALID_REVIEW_MS = Date.UTC(1980, 0, 1);

function isValidReviewDate(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= MIN_VALID_REVIEW_MS;
}

/** Prefer real submission time; ignore null/epoch placeholder dates. */
export function resolvePeerReviewDate(row: Record<string, unknown>): string {
  for (const key of ["reviewed_at", "review_date", "date", "created_at", "updated_at"]) {
    const value = row[key];
    if (isValidReviewDate(value)) return value;
  }
  return new Date().toISOString();
}

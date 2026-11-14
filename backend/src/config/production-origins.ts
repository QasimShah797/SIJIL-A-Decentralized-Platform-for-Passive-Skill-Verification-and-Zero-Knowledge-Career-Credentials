/**
 * Production browser origins must be HTTPS. Local development keeps http://localhost.
 */
export function productionOriginProblems(corsOrigin: string, frontendUrl: string): string[] {
  const problems: string[] = [];
  const origins = corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) problems.push("CORS_ORIGIN is empty");
  for (const origin of origins) {
    if (origin === "*" || !origin.startsWith("https://")) {
      problems.push("CORS_ORIGIN must list https origins");
    }
  }
  if (!frontendUrl.startsWith("https://")) {
    problems.push("FRONTEND_URL must use https");
  }
  return problems;
}

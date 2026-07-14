export const LINKEDIN_PROFILE_URL_ERROR =
  "Enter a valid LinkedIn profile URL, for example:\nhttps://www.linkedin.com/in/username";

/**
 * Normalize and validate a LinkedIn profile URL.
 * Returns null for empty input. Throws with LINKEDIN_PROFILE_URL_ERROR when invalid.
 */
export function normalizeLinkedInProfileUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^javascript:/i.test(trimmed)) {
    throw new Error(LINKEDIN_PROFILE_URL_ERROR);
  }

  let urlString = trimmed;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(LINKEDIN_PROFILE_URL_ERROR);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(LINKEDIN_PROFILE_URL_ERROR);
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "linkedin.com" && host !== "www.linkedin.com") {
    throw new Error(LINKEDIN_PROFILE_URL_ERROR);
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (!path.startsWith("/in/") || path.length <= "/in".length) {
    throw new Error(LINKEDIN_PROFILE_URL_ERROR);
  }

  return `https://www.linkedin.com${path}${parsed.search}`;
}

/** True when input is empty or normalizes to a valid LinkedIn profile URL. */
export function isOptionalLinkedInProfileUrlValid(input: string): boolean {
  try {
    normalizeLinkedInProfileUrl(input);
    return true;
  } catch {
    return false;
  }
}

/** Normalize optional LinkedIn URL; empty string becomes null. */
export function validateOptionalLinkedInProfileUrl(input: string): string | null {
  return normalizeLinkedInProfileUrl(input);
}

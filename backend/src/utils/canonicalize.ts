/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Wraps the `canonicalize` npm package so credential hashes are deterministic.
 */
import canonicalize from "canonicalize";

export function canonicalizeJson(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== "string") {
    throw new Error("JSON canonicalization produced no output");
  }
  return result;
}

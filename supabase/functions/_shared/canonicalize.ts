/**
 * RFC 8785 JCS — byte-identical to npm `canonicalize@2.0.0` (Apache-2.0).
 * Proven by shared/rfc8785-test-vector.json (backend unit test).
 */
export function canonicalizeJson(value: unknown): string {
  if (typeof value === "number" && Number.isNaN(value)) {
    throw new Error("NaN is not allowed");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Infinity is not allowed");
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  const record = value as Record<string, unknown> & { toJSON?: () => unknown };
  if (typeof record.toJSON === "function") {
    return canonicalizeJson(record.toJSON());
  }

  if (Array.isArray(value)) {
    const values = value.reduce<string>((acc, current, index) => {
      const comma = index === 0 ? "" : ",";
      const next = current === undefined || typeof current === "symbol" ? null : current;
      return `${acc}${comma}${canonicalizeJson(next)}`;
    }, "");
    return `[${values}]`;
  }

  const values = Object.keys(record).sort().reduce((acc, key) => {
    const nested = record[key];
    if (nested === undefined || typeof nested === "symbol") {
      return acc;
    }
    const comma = acc.length === 0 ? "" : ",";
    return `${acc}${comma}${canonicalizeJson(key)}:${canonicalizeJson(nested)}`;
  }, "");
  return `{${values}}`;
}

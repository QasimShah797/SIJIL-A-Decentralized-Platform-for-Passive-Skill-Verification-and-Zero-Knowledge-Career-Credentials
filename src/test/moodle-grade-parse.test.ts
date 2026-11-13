import { describe, expect, it } from "vitest";

/**
 * Mirrors supabase/functions/moodle-sync/moodle-sync-core.ts parseMoodleGrade.
 * Kept local so vitest does not import Deno edge modules.
 */
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMoodleGrade(v: unknown): number | null {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || trimmed === "—" || trimmed === "-") return null;
    const fraction = trimmed.match(/^([\d.]+)(?:\s*\/\s*([\d.]+))?$/);
    if (fraction) {
      const n = parseNum(fraction[1]);
      if (n === null || n < 0) return null;
      return n;
    }
  }
  const n = parseNum(v);
  if (n === null || n < 0) return null;
  return n;
}

describe("parseMoodleGrade", () => {
  it("parses Moodle released grades like 85.00000 without stack overflow", () => {
    expect(parseMoodleGrade("85.00000")).toBe(85);
    expect(parseMoodleGrade("85/100")).toBe(85);
    expect(parseMoodleGrade(85)).toBe(85);
    expect(parseMoodleGrade("-1")).toBeNull();
    expect(parseMoodleGrade("—")).toBeNull();
  });
});

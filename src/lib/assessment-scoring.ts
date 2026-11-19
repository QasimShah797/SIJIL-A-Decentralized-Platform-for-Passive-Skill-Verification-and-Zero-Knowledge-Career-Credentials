/**
 * Closed-ended scoring for SIJIL practical assessments.
 * The Edge Function imports this module. It never returns answer keys.
 * A legacy key of { id, correctOptionId } still scores as one single-choice item.
 */

export type ClosedScoreType =
  | "single"
  | "scenario"
  | "case"
  | "multi"
  | "boolean"
  | "code-output"
  | "debug"
  | "order"
  | "match"
  | "hotspot";

export type ClosedAnswerKey = {
  id: string;
  type: ClosedScoreType;
  correctOptionId?: string;
  correctOptionIds?: string[];
  correctOrder?: string[];
  correctMatches?: Record<string, string>;
};

const SINGLE_TYPES = new Set<ClosedScoreType>([
  "single",
  "scenario",
  "case",
  "boolean",
  "code-output",
  "debug",
  "hotspot",
]);

const PASS_RATIO = 0.6;

function optionId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
    return ["A", "B", "C", "D"][value];
  }
  const id = String(value ?? "").trim().toUpperCase();
  if (id === "A" || id === "B" || id === "C" || id === "D" || id === "TRUE" || id === "FALSE") {
    return id === "TRUE" ? "A" : id === "FALSE" ? "B" : id;
  }
  return null;
}

function asType(value: unknown): ClosedScoreType {
  const type = String(value ?? "single").toLowerCase();
  if (
    type === "scenario" || type === "case" || type === "multi" || type === "boolean"
    || type === "code-output" || type === "debug" || type === "order" || type === "match"
    || type === "hotspot" || type === "single"
  ) {
    return type;
  }
  return "single";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.includes(",")) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function optionSet(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const ids = list
    .map((item) => optionId(item))
    .filter((item): item is string => Boolean(item));
  return [...new Set(ids)].sort();
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function parseClosedAnswerKey(raw: unknown): ClosedAnswerKey[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? row.question_id ?? "").trim();
      if (!id) return [];
      const type = asType(row.type);
      const correctOptionId = optionId(
        row.correctOptionId ?? row.correct_option_id ?? row.correctAnswer ?? row.answer,
      ) ?? undefined;
      const correctOptionIds = optionSet(row.correctOptionIds ?? row.correct_option_ids);
      const correctOrder = stringList(row.correctOrder ?? row.correct_order);
      const matchRaw = row.correctMatches ?? row.correct_matches;
      const correctMatches = matchRaw && typeof matchRaw === "object" && !Array.isArray(matchRaw)
        ? Object.fromEntries(Object.entries(matchRaw as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
        : undefined;

      if (type === "multi" && correctOptionIds.length === 0) return [];
      if (type === "order" && correctOrder.length === 0) return [];
      if (type === "match" && (!correctMatches || Object.keys(correctMatches).length === 0)) return [];
      if (SINGLE_TYPES.has(type) && !correctOptionId) return [];

      return [{
        id,
        type,
        correctOptionId,
        correctOptionIds,
        correctOrder,
        correctMatches,
      }];
    });
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const correctOptionId = optionId(value);
      if (!id || !correctOptionId) return [];
      return [{ id, type: "single" as const, correctOptionId }];
    });
  }

  return [];
}

export function responseIsCorrect(entry: ClosedAnswerKey, raw: unknown): boolean {
  if (entry.type === "multi") {
    const expected = [...new Set(entry.correctOptionIds ?? [])].sort();
    return expected.length > 0 && sameList(optionSet(raw), expected);
  }
  if (entry.type === "order") {
    return sameList(stringList(raw), entry.correctOrder ?? []);
  }
  if (entry.type === "match") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const given = raw as Record<string, unknown>;
    const expected = entry.correctMatches ?? {};
    const keys = Object.keys(expected);
    return keys.length > 0 && keys.every((key) => String(given[key] ?? "") === expected[key]);
  }
  return optionId(raw) === entry.correctOptionId;
}

export function scoreClosedAssessment(
  answerKeyRaw: unknown,
  answers: Record<string, unknown>,
): {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
} {
  const entries = parseClosedAnswerKey(answerKeyRaw);
  const totalQuestions = entries.length;
  const correctCount = entries.filter((entry) => responseIsCorrect(entry, answers?.[entry.id])).length;
  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = totalQuestions > 0 && correctCount / totalQuestions >= PASS_RATIO;
  return { correctCount, totalQuestions, percentage, passed };
}

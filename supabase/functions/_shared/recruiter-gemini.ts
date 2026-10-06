export const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash";

export const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    intent: { type: "string" },
    headline: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          rank: { type: "integer", nullable: true },
          verdict: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          basis: {
            type: "object",
            properties: {
              credentials: { type: "integer" },
              evidence: { type: "integer" },
              verifiedEvidence: { type: "integer" },
            },
            required: ["credentials", "evidence", "verifiedEvidence"],
          },
        },
        required: ["id", "verdict", "strengths", "gaps", "basis"],
      },
    },
    notDisclosed: { type: "array", items: { type: "string" } },
    followUps: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "headline", "candidates", "notDisclosed", "followUps"],
};

export type GeminiFailureCode = "UPSTREAM_HTTP" | "UPSTREAM_EMPTY" | "UPSTREAM_BLOCKED" | "UPSTREAM_TRUNCATED" | "BAD_JSON";

/** Gemini structured output accepts nullable fields and rejects union types and additionalProperties. */
export function schemaAcceptedByGemini(schema: unknown): boolean {
  const text = JSON.stringify(schema);
  if (text.includes("additionalProperties")) return false;
  if (/"type":\[/.test(text)) return false;
  return true;
}

export function geminiErrorFields(body: unknown, httpStatus: number): { upstreamStatus: number; upstreamMessage: string } {
  const record = body && typeof body === "object" ? body as { error?: { status?: unknown; message?: unknown } } : {};
  const statusName = typeof record.error?.status === "string" ? record.error.status : "";
  const message = typeof record.error?.message === "string" ? record.error.message : "";
  const combined = [statusName, message].filter(Boolean).join(": ");
  return {
    upstreamStatus: httpStatus,
    upstreamMessage: (combined || `HTTP ${httpStatus}`).slice(0, 300),
  };
}

export function classifyGeminiResponse(input: {
  httpStatus: number;
  finishReason?: string | null;
  blockReason?: string | null;
  hasParts: boolean;
  text: string;
}): { code: GeminiFailureCode; status: number } | { code: "OK"; text: string } {
  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return { code: "UPSTREAM_HTTP", status: input.httpStatus };
  }
  const finish = (input.finishReason ?? "").toUpperCase();
  const blockedFinish = finish === "SAFETY" || finish === "BLOCKLIST" || finish === "PROHIBITED_CONTENT" || finish === "RECITATION";
  if (input.blockReason || blockedFinish) return { code: "UPSTREAM_BLOCKED", status: input.httpStatus };
  if (finish === "MAX_TOKENS") return { code: "UPSTREAM_TRUNCATED", status: input.httpStatus };
  if (!input.hasParts || !input.text.trim()) return { code: "UPSTREAM_EMPTY", status: input.httpStatus };
  return { code: "OK", text: input.text };
}

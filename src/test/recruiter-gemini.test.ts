import { describe, expect, it } from "vitest";
import { ANSWER_SCHEMA, classifyGeminiResponse, geminiErrorFields, schemaAcceptedByGemini } from "../../supabase/functions/_shared/recruiter-gemini.ts";

describe("Gemini match responses", () => {
  it("accepts the flat nullable schema and rejects unsupported keywords", () => {
    expect(schemaAcceptedByGemini(ANSWER_SCHEMA)).toBe(true);
    expect(schemaAcceptedByGemini({ type: "object", additionalProperties: false })).toBe(false);
    expect(schemaAcceptedByGemini({ properties: { rank: { type: ["integer", "null"] } } })).toBe(false);
  });

  it("maps a Gemini 400 body to upstream status and message", () => {
    const fields = geminiErrorFields({
      error: { status: "INVALID_ARGUMENT", message: "Request contains an invalid argument." },
    }, 400);
    expect(fields.upstreamStatus).toBe(400);
    expect(fields.upstreamMessage).toContain("INVALID_ARGUMENT");
    expect(fields.upstreamMessage.length).toBeLessThanOrEqual(300);
    expect(classifyGeminiResponse({ httpStatus: 400, hasParts: false, text: "" }).code).toBe("UPSTREAM_HTTP");
  });

  it("maps empty, truncated, and blocked responses to specific codes", () => {
    expect(classifyGeminiResponse({ httpStatus: 400, hasParts: false, text: "" }).code).toBe("UPSTREAM_HTTP");
    expect(classifyGeminiResponse({ httpStatus: 200, hasParts: false, text: "" }).code).toBe("UPSTREAM_EMPTY");
    expect(classifyGeminiResponse({ httpStatus: 200, finishReason: "MAX_TOKENS", hasParts: true, text: "{" }).code).toBe("UPSTREAM_TRUNCATED");
    expect(classifyGeminiResponse({ httpStatus: 200, blockReason: "SAFETY", hasParts: false, text: "" }).code).toBe("UPSTREAM_BLOCKED");
    expect(classifyGeminiResponse({ httpStatus: 200, finishReason: "SAFETY", hasParts: false, text: "" }).code).toBe("UPSTREAM_BLOCKED");
  });
});

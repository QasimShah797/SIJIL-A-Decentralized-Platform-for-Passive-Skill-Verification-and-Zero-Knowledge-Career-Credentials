import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.25.76";
import { hasAiProviderConfigured } from "../_shared/github-task-pipeline.ts";
import { ANSWER_SCHEMA, classifyGeminiResponse, geminiErrorFields, GEMINI_MODEL_DEFAULT, type GeminiFailureCode } from "../_shared/recruiter-gemini.ts";
import { getEvidenceStats } from "../_shared/recruiter-evidence.ts";
import { displaySkill } from "../_shared/recruiter-skills.ts";
import { normalizeSkill } from "../_shared/recruiter-skills.ts";
import {
  allowMatchRequest,
  recruiterAccess,
  sanitizeQuestion,
  validateRecruiterMatchAnswer,
  type RecruiterMatchAnswer,
} from "../_shared/recruiter-match-contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? GEMINI_MODEL_DEFAULT;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

const answerZ = z.object({
  intent: z.string().optional(),
  headline: z.string(),
  candidates: z.array(z.object({
    id: z.string(),
    rank: z.number().nullable().optional(),
    verdict: z.string().optional(),
    strengths: z.array(z.string()).optional(),
    gaps: z.array(z.string()).optional(),
    basis: z.object({
      credentials: z.number(),
      evidence: z.number(),
      verifiedEvidence: z.number(),
    }).optional(),
  })).optional(),
  notDisclosed: z.array(z.string()).optional(),
  followUps: z.array(z.string()).optional(),
});

class MatchError extends Error {
  code: GeminiFailureCode;
  status: number;
  upstreamMessage: string;
  schemaRejected: boolean;
  constructor(code: GeminiFailureCode, status: number, upstreamMessage = "", schemaRejected = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.upstreamMessage = upstreamMessage.slice(0, 300);
    this.schemaRejected = schemaRejected;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: "AUTH" | "NOT_FOUND" | "UPSTREAM" | GeminiFailureCode | "RATE", error: string, upstreamStatus?: number, upstreamMessage?: string) {
  return json({
    error,
    code,
    upstreamStatus: upstreamStatus ?? status,
    upstreamMessage: (upstreamMessage ?? "").slice(0, 300),
  }, status);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

type ShareRow = {
  learner_id?: string;
  disclosed_payload?: unknown;
  created_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type ContextCandidate = {
  id: string;
  name: string;
  campus: string;
  approval: string;
  skills: string[];
  credentials: number;
  evidenceTotal: number;
  verified: number;
  corroborating: number;
  matchedVerified: number;
  matchedCorroborating: number;
  latestSharedAt: string | null;
};

function buildCandidate(id: string, shares: ShareRow[], profile: Record<string, unknown> | undefined, question: string): ContextCandidate {
  const skills = new Map<string, string>();
  let latest: string | null = null;
  let approval = "Pending";

  for (const share of shares) {
    const payload = asRecord(share.disclosed_payload) ?? {};
    const competency = asRecord(payload.competency);
    const skillRows = asRecords(payload.skills);
    const names = skillRows.length
      ? skillRows.map((row) => asText(row.name)).filter((name): name is string => Boolean(name))
      : [asText(competency?.name)].filter((name): name is string => Boolean(name));
    for (const name of names) {
      const key = normalizeSkill(name);
      if (key && !skills.has(key)) skills.set(key, displaySkill(name).slice(0, 40));
    }
    const status = `${asText(competency?.attestation) ?? ""} ${asText(competency?.status) ?? ""}`.toLowerCase();
    if (/approv|verified|issued/.test(status)) approval = "Approved";
    if (share.created_at && (!latest || share.created_at > latest)) latest = share.created_at;
  }

  return {
    id,
    name: (asText(profile?.full_name) ?? "Learner").slice(0, 80),
    campus: (asText(profile?.institution_name) ?? "—").slice(0, 80),
    approval,
    skills: [...skills.values()].slice(0, 12),
    ...(() => {
      const stats = getEvidenceStats({
        disclosedPayloads: shares.map((share) => share.disclosed_payload),
        credentialCount: shares.length,
      }, question);
      return {
        credentials: stats.credentials,
        evidenceTotal: stats.evidenceTotal,
        verified: stats.verified,
        corroborating: stats.corroborating,
        matchedVerified: stats.matched.verified,
        matchedCorroborating: stats.matched.corroborating,
      };
    })(),
    latestSharedAt: latest,
  };
}

function toMatchError(error: unknown): MatchError {
  if (error instanceof MatchError) return error;
  return new MatchError("UPSTREAM_EMPTY", 502);
}

async function geminiGenerate(prompt: string, useSchema: boolean): Promise<unknown> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new MatchError("UPSTREAM_EMPTY", 503);
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
  };
  if (useSchema) generationConfig.responseSchema = ANSWER_SCHEMA;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: useSchema ? prompt : `${prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(ANSWER_SCHEMA)}` }] }],
        generationConfig,
      }),
    },
  );
  const body = await res.json().catch(() => ({})) as {
    error?: { status?: string; message?: string };
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts;
  const hasParts = Array.isArray(parts) && parts.some((part) => typeof part?.text === "string" && part.text.trim());
  const text = Array.isArray(parts) ? parts.map((part) => part?.text ?? "").join("") : "";
  const geminiError = geminiErrorFields(body, res.status);
  console.info("recruiter-match gemini", {
    status: res.status,
    errorStatus: body.error?.status ?? null,
    finishReason: candidate?.finishReason ?? null,
    blockReason: body.promptFeedback?.blockReason ?? null,
    hasParts,
    model: GEMINI_MODEL,
  });
  if (!res.ok && useSchema && res.status === 400) {
    throw new MatchError("UPSTREAM_HTTP", res.status, geminiError.upstreamMessage, true);
  }
  if (!res.ok) throw new MatchError("UPSTREAM_HTTP", res.status, geminiError.upstreamMessage);
  const classified = classifyGeminiResponse({
    httpStatus: res.status,
    finishReason: candidate?.finishReason,
    blockReason: body.promptFeedback?.blockReason,
    hasParts,
    text,
  });
  if (classified.code !== "OK") throw new MatchError(classified.code, classified.status);
  try {
    return JSON.parse(classified.text);
  } catch {
    throw new MatchError("BAD_JSON", res.status);
  }
}

async function askGemini(prompt: string): Promise<unknown> {
  try {
    return await geminiGenerate(prompt, true);
  } catch (error) {
    const match = toMatchError(error);
    if (!match.schemaRejected) throw match;
    return geminiGenerate(prompt, false);
  }
}

async function askGroq(prompt: string): Promise<unknown> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new MatchError("UPSTREAM_EMPTY", 503);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Respond with JSON only." },
        { role: "user", content: `${prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(ANSWER_SCHEMA)}` },
      ],
    }),
  });
  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const groqMessage = String(body.error?.message ?? "").replace(key, "[key]").slice(0, 240);
  console.info("recruiter-match groq", { status: res.status, model: GROQ_MODEL, hasParts: Boolean(text.trim()) });
  if (!res.ok) throw new MatchError("UPSTREAM_HTTP", res.status, groqMessage ? `Groq: ${groqMessage}` : "Groq request failed");
  if (!text.trim()) throw new MatchError("UPSTREAM_EMPTY", res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new MatchError("BAD_JSON", res.status);
  }
}

async function askModel(prompt: string): Promise<unknown> {
  const errors: MatchError[] = [];
  if (Deno.env.get("GEMINI_API_KEY")) {
    try {
      return await askGemini(prompt);
    } catch (error) {
      errors.push(toMatchError(error));
    }
  }
  if (Deno.env.get("GROQ_API_KEY")) {
    try {
      return await askGroq(prompt);
    } catch (error) {
      errors.push(toMatchError(error));
    }
  }
  const message = errors.map((error) => error.upstreamMessage).filter(Boolean).join(" | ").slice(0, 300);
  throw new MatchError(errors[0]?.code ?? "UPSTREAM_EMPTY", errors[0]?.status ?? 503, message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(401, "AUTH", "Unauthorized");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return fail(401, "AUTH", "Unauthorized");

    const { data: roles, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const access = recruiterAccess({
      authenticated: true,
      roles: roleError ? null : (roles ?? []).map((row) => String(row.role)),
      roleLookupFailed: Boolean(roleError),
    });
    if (access === 403) return fail(403, "AUTH", "Recruiter access required");
    if (!allowMatchRequest(userData.user.id)) {
      return fail(429, "RATE", "Too many questions. Try again in a minute.");
    }

    const body = await req.json().catch(() => null);
    const question = sanitizeQuestion(body && typeof body === "object" ? (body as { question?: unknown }).question : "");
    if (!question) return fail(400, "BAD_JSON", "Enter a question of up to 500 characters.");

    const requested = Array.isArray((body as { candidateIds?: unknown }).candidateIds)
      ? (body as { candidateIds: unknown[] }).candidateIds.filter((id): id is string => typeof id === "string").slice(0, 20)
      : [];

    const { data: shareRows, error: shareError } = await userClient
      .from("selective_disclosure_presentations")
      .select("learner_id, disclosed_payload, created_at, expires_at, revoked_at")
      .is("revoked_at", null)
      .limit(200);
    if (shareError) {
      const detail = `${shareError.code ?? ""} ${shareError.message ?? ""}`;
      const missing = /does not exist|not found|PGRST205/i.test(detail);
      return fail(missing ? 404 : 500, missing ? "NOT_FOUND" : "UPSTREAM", "Could not load shared candidates.");
    }

    const now = Date.now();
    const active = ((shareRows ?? []) as ShareRow[]).filter((row) => {
      if (!row.learner_id || row.revoked_at) return false;
      if (!row.expires_at) return true;
      const expires = new Date(row.expires_at).getTime();
      return Number.isNaN(expires) || expires > now;
    });
    const byLearner = new Map<string, ShareRow[]>();
    for (const row of active) {
      const id = row.learner_id as string;
      if (requested.length && !requested.includes(id)) continue;
      const bucket = byLearner.get(id) ?? [];
      bucket.push(row);
      byLearner.set(id, bucket);
    }
    const learnerIds = [...byLearner.keys()].slice(0, 20);
    if (!learnerIds.length) {
      return json({
        intent: "other",
        headline: "No shared candidates match this request.",
        candidates: [],
        comparison: null,
        notDisclosed: [],
        followUps: ["Who has shared a credential?", "Show learners from a campus"],
      });
    }

    const { data: profiles } = await userClient
      .from("learner_profiles")
      .select("user_id, full_name, institution_name")
      .in("user_id", learnerIds);
    const profileById = new Map((profiles ?? []).map((row) => [String(row.user_id), row as Record<string, unknown>]));
    const context = learnerIds.map((id) => buildCandidate(id, byLearner.get(id) ?? [], profileById.get(id), question));

    if (!hasAiProviderConfigured()) {
      return fail(503, "UPSTREAM", "SIJIL Match is not configured yet.");
    }

    const prompt = `You answer a recruiter using ONLY the disclosed candidate context below.
Rules:
1. Use only this context. If a fact is absent, list it in notDisclosed. Never invent skills, scores, employers, or dates.
2. evidenceTotal, verified, and corroborating are the candidate totals. matchedVerified and matchedCorroborating are evidence on skills that match the question. evidenceTotal equals verified plus corroborating. Copy basis.evidence from evidenceTotal and basis.verifiedEvidence from verified. Do not treat commits or files as evidence.
3. For rankings, set rank starting at 1. The headline names who has the strongest shared evidence and the skills that drove it. Do not mention teachers or an Evidence Profile.
4. Refuse criteria about name, gender, ethnicity, religion, age, appearance, or campus. Rank only on disclosed skills and evidence. Use the name only to identify the person.
5. Be concise and neutral. You support a human decision; you do not make the hiring decision.
6. candidate ids must be copied from the context. intent is one of compare, find, rank, gap, summary, other.
7. followUps has at most 3 short questions. Do not add fields outside the schema.

Context:
${JSON.stringify(context)}

Question:
${question}`;

    let answer: RecruiterMatchAnswer | null = null;
    let failure: MatchError | null = null;
    for (let attempt = 0; attempt < 2 && !answer; attempt += 1) {
      try {
        const raw = await askModel(prompt);
        const checked = answerZ.safeParse(raw);
        if (!checked.success) {
          failure = new MatchError("BAD_JSON", 502);
          continue;
        }
        answer = validateRecruiterMatchAnswer(checked.data, learnerIds);
        if (!answer) failure = new MatchError("BAD_JSON", 502);
      } catch (error) {
        failure = toMatchError(error);
        if (failure.code !== "UPSTREAM_EMPTY" && failure.code !== "BAD_JSON" && failure.code !== "UPSTREAM_TRUNCATED") break;
      }
    }
    if (!answer) {
      const code = failure?.code ?? "UPSTREAM_EMPTY";
      return fail(502, code, "SIJIL Match could not answer just now. Try again.", failure?.status, failure?.upstreamMessage);
    }
    const byId = new Map(context.map((item) => [item.id, item]));
    return json({
      ...answer,
      candidates: answer.candidates.map((candidate) => {
        const source = byId.get(candidate.id);
        if (!source) return candidate;
        return {
          ...candidate,
          matchedVerified: source.matchedVerified,
          matchedCorroborating: source.matchedCorroborating,
          basis: {
            credentials: source.credentials,
            evidence: source.evidenceTotal,
            verifiedEvidence: source.verified,
          },
        };
      }),
    });
  } catch {
    return fail(502, "UPSTREAM", "SIJIL Match could not answer just now. Try again.");
  }
});

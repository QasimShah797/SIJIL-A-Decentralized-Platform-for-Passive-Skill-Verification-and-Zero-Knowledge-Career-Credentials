import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { hasAiProviderConfigured, llmJson } from "../_shared/github-task-pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERPRET_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", description: "match, compare, or clarify" },
    skills: { type: "array", items: { type: "string" } },
    requireLms: { type: "boolean" },
    requireGithub: { type: "boolean" },
    requireTask: { type: "boolean" },
    requireReviews: { type: "boolean" },
    learnerNames: { type: "array", items: { type: "string" } },
    institution: { type: "string" },
    reply: { type: "string" },
  },
  required: [
    "intent",
    "skills",
    "requireLms",
    "requireGithub",
    "requireTask",
    "requireReviews",
    "learnerNames",
    "institution",
    "reply",
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asStringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => item.slice(0, maxLength));
}

async function requireRecruiter(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: roles, error: roleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);

  if (roleError) {
    return json({ error: "Could not verify recruiter access" }, 403);
  }

  const allowed = (roles ?? []).some((row) => row.role === "recruiter" || row.role === "admin");
  if (!allowed) {
    return json({ error: "Recruiter access required" }, 403);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const denied = await requireRecruiter(req);
    if (denied) return denied;

    if (!hasAiProviderConfigured()) {
      return json({
        error: "No AI provider configured. Set GEMINI_API_KEY and/or GROQ_API_KEY in Supabase secrets.",
      }, 503);
    }

    const body = await req.json();
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
    if (!question) {
      return json({ error: "Missing question" }, 400);
    }

    const knownSkills = asStringList(body.knownSkills, 60, 40);
    const learnerNames = asStringList(body.learnerNames, 60, 80);
    const institutions = asStringList(body.institutions, 40, 80);
    const history = Array.isArray(body.history)
      ? body.history.slice(-6).flatMap((turn: unknown) => {
        if (!turn || typeof turn !== "object") return [];
        const row = turn as { role?: unknown; text?: unknown };
        const role = row.role === "recruiter" || row.role === "bot" ? row.role : null;
        const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
        if (!role || !text) return [];
        return [`${role}: ${text}`];
      })
      : [];

    const prompt = `You interpret questions for SIJIL Match, a recruiter shortlist.
You do not see private credentials, hidden fields, scores, or evidence counts.
You only see competency names and learner display names that are already in the recruiter directory.

Known competencies:
${knownSkills.length ? knownSkills.join(", ") : "(none listed)"}

Learner display names:
${learnerNames.length ? learnerNames.join("; ") : "(none listed)"}

Institutions already in the directory:
${institutions.length ? institutions.join(", ") : "(none listed)"}

${history.length ? `Recent conversation:\n${history.join("\n")}\n` : ""}
Recruiter question:
${question}

Return JSON with:
- intent: "match" when they want a shortlist, "compare" when they want two learners side by side, "clarify" when the question is too vague to search.
- skills: competency names they asked for. Prefer a name from the known competencies when it is the same skill. Flutter means Dart when Dart is known. Do not put GitHub, Moodle, LMS, project, review, or proof words in skills.
- requireLms: true when they want coursework, Moodle, LMS, or faculty evidence.
- requireGithub: true when they want a GitHub project, repository, or commits.
- requireTask: true when they want a practical or hands-on task.
- requireReviews: true when they want peer reviews or endorsements.
- learnerNames: name fragments they used, only when comparing specific people. Otherwise an empty array. Do not invent people who are not in the display names.
- institution: the institution they asked for, copied from the directory list when they say "from", "at", or "institution of". Empty string when they did not ask for an institution. CUST matches CUST.
- reply: one or two plain sentences saying what you understood. Do not claim who matches, do not invent evidence, and do not use markdown.

If they name two people, intent is compare. If they ask to compare learners who have a skill, intent is compare and learnerNames stays empty. If they ask for learners from an institution, intent is match even when they name no skill. If they only greet or give no competency, no institution, and no names, intent is clarify.`;

    const interpreted = await llmJson<{
      intent: string;
      skills: string[];
      requireLms: boolean;
      requireGithub: boolean;
      requireTask: boolean;
      requireReviews: boolean;
      learnerNames: string[];
      institution: string;
      reply: string;
    }>({
      purpose: "classify",
      prompt,
      schema: INTERPRET_SCHEMA,
      temperature: 0.1,
    });

    const intent = interpreted.intent === "compare" || interpreted.intent === "clarify"
      ? interpreted.intent
      : "match";

    return json({
      intent,
      skills: asStringList(interpreted.skills, 6, 40),
      requireLms: interpreted.requireLms === true,
      requireGithub: interpreted.requireGithub === true,
      requireTask: interpreted.requireTask === true,
      requireReviews: interpreted.requireReviews === true,
      learnerNames: asStringList(interpreted.learnerNames, 4, 80),
      institution: typeof interpreted.institution === "string" ? interpreted.institution.trim().slice(0, 80) : "",
      reply: typeof interpreted.reply === "string"
        ? interpreted.reply.replace(/\s+/g, " ").trim().slice(0, 500)
        : "",
    });
  } catch (error) {
    console.error("recruiter-match error:", error);
    const message = error instanceof Error ? error.message : "Could not interpret the question";
    return json({ error: message }, 500);
  }
});

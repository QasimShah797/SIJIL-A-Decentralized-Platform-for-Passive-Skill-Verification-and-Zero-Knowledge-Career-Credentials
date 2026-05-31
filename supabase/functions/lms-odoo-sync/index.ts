// Fetches courses/grades/certificates from a CUST Odoo LMS via JSON-RPC.
// Caller passes their own Odoo URL/DB/login/API-key per request.
// We never store the API key — neither in DB nor in env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type OdooCreds = {
  url: string;
  db: string;
  login: string;
  api_key: string;
};

async function odooJsonRpc(
  url: string,
  service: string,
  method: string,
  args: unknown[],
) {
  const res = await fetch(`${url.replace(/\/+$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9),
    }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) {
    const msg = j.error?.data?.message || j.error?.message || "Odoo error";
    throw new Error(msg);
  }
  return j.result;
}

async function authenticate(c: OdooCreds): Promise<number> {
  const uid = await odooJsonRpc(c.url, "common", "authenticate", [
    c.db,
    c.login,
    c.api_key,
    {},
  ]);
  if (!uid || typeof uid !== "number") {
    throw new Error("Authentication failed — check URL, DB, login, or API key.");
  }
  return uid;
}

async function executeKw(
  c: OdooCreds,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
) {
  return await odooJsonRpc(c.url, "object", "execute_kw", [
    c.db,
    uid,
    c.api_key,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function searchReadSafe(
  c: OdooCreds,
  uid: number,
  model: string,
  domain: unknown[],
  fields: string[],
  limit = 200,
) {
  try {
    return (await executeKw(c, uid, model, "search_read", [domain, fields], {
      limit,
    })) as Array<Record<string, unknown>>;
  } catch (_e) {
    // Model not installed in this Odoo instance — return empty, don't fail the whole sync.
    return [];
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return "sha256:" + Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Evidence = {
  source: string;
  course_name: string;
  course_code: string | null;
  grade: string | null;
  completion_status: string | null;
  certificate_url: string | null;
  evidence_hash: string;
  raw: Record<string, unknown>;
  text_preview: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const url = String(body.odoo_url ?? "").trim();
    const db = String(body.odoo_db ?? "").trim();
    const login = String(body.odoo_login ?? "").trim();
    const api_key = String(body.odoo_api_key ?? "").trim();
    const persist = body.persist !== false; // default true

    if (!url || !db || !login || !api_key) {
      return new Response(
        JSON.stringify({ error: "odoo_url, odoo_db, odoo_login, odoo_api_key are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^https?:\/\//i.test(url)) {
      return new Response(
        JSON.stringify({ error: "odoo_url must start with http(s)://" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const creds: OdooCreds = { url, db, login, api_key };

    let uid: number;
    try {
      uid = await authenticate(creds);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "Auth failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const evidence: Evidence[] = [];

    // 1) Course enrollments / completions  (op.subject.registration / openeducat)
    const regs = await searchReadSafe(
      creds, uid,
      "op.subject.registration",
      [["student_id.user_id", "=", uid]],
      ["id", "subject_id", "state", "course_id", "name"],
      200,
    );
    for (const r of regs) {
      const course = Array.isArray(r.subject_id) ? (r.subject_id as [number, string])[1] : String(r.subject_id ?? r.name ?? "Course");
      const status = String(r.state ?? "");
      const ev: Evidence = {
        source: "CUST Odoo LMS",
        course_name: course,
        course_code: null,
        grade: null,
        completion_status: status || "Enrolled",
        certificate_url: null,
        evidence_hash: await sha256Hex(`reg:${r.id}:${course}:${status}`),
        raw: r,
        text_preview: null,
      };
      evidence.push(ev);
    }

    // 2) Grades / marksheets  (op.marksheet.line, op.result.line)
    const marks = await searchReadSafe(
      creds, uid,
      "op.result.line",
      [["student_id.user_id", "=", uid]],
      ["id", "subject_id", "marks", "grade", "status", "exam_id"],
      200,
    );
    for (const m of marks) {
      const course = Array.isArray(m.subject_id) ? (m.subject_id as [number, string])[1] : "Subject";
      const grade = String(m.grade ?? m.marks ?? "");
      evidence.push({
        source: "CUST Odoo LMS",
        course_name: course,
        course_code: null,
        grade: grade || null,
        completion_status: String(m.status ?? "Graded"),
        certificate_url: null,
        evidence_hash: await sha256Hex(`mark:${m.id}:${course}:${grade}`),
        raw: m,
        text_preview: null,
      });
    }

    // 3) Survey/quiz attempts (Odoo eLearning)
    const attempts = await searchReadSafe(
      creds, uid,
      "survey.user_input",
      [["partner_id.user_ids", "in", [uid]], ["state", "=", "done"]],
      ["id", "survey_id", "scoring_percentage", "scoring_success", "create_date"],
      200,
    );
    for (const a of attempts) {
      const name = Array.isArray(a.survey_id) ? (a.survey_id as [number, string])[1] : "Quiz";
      const score = a.scoring_percentage != null ? `${a.scoring_percentage}%` : null;
      evidence.push({
        source: "CUST Odoo LMS",
        course_name: name,
        course_code: null,
        grade: score,
        completion_status: a.scoring_success ? "Passed" : "Completed",
        certificate_url: null,
        evidence_hash: await sha256Hex(`quiz:${a.id}:${name}:${score}`),
        raw: a,
        text_preview: null,
      });
    }

    // 4) Slide channel completion / certificates (Odoo eLearning)
    const slidePartners = await searchReadSafe(
      creds, uid,
      "slide.channel.partner",
      [["partner_id.user_ids", "in", [uid]]],
      ["id", "channel_id", "completion", "completed", "completed_slides_count"],
      200,
    );
    for (const sp of slidePartners) {
      const name = Array.isArray(sp.channel_id) ? (sp.channel_id as [number, string])[1] : "Course";
      const completion = sp.completion != null ? `${sp.completion}%` : null;
      evidence.push({
        source: "CUST Odoo LMS",
        course_name: name,
        course_code: null,
        grade: completion,
        completion_status: sp.completed ? "Completed" : "In Progress",
        certificate_url: null,
        evidence_hash: await sha256Hex(`slide:${sp.id}:${name}:${completion}`),
        raw: sp,
        text_preview: null,
      });
    }

    // Persist (upsert by evidence_hash) — uses user JWT so RLS is enforced.
    let inserted = 0;
    if (persist && evidence.length) {
      const rows = evidence.map((e) => ({ ...e, user_id: userId }));
      const { error: upErr, count } = await userClient
        .from("lms_evidence")
        .upsert(rows, { onConflict: "user_id,evidence_hash", count: "exact" });
      if (upErr) throw new Error(`DB upsert failed: ${upErr.message}`);
      inserted = count ?? rows.length;

      await userClient
        .from("lms_connections")
        .upsert(
          {
            user_id: userId,
            odoo_url: url,
            odoo_db: db,
            odoo_login: login,
            has_api_key: true,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    }

    return new Response(
      JSON.stringify({ success: true, fetched: evidence.length, persisted: inserted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("lms-odoo-sync error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

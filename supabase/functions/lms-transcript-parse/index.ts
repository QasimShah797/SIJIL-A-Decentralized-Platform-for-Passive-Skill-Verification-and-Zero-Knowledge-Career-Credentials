// Parse an uploaded transcript PDF (in lms-transcripts bucket) and extract
// course/grade rows as lms_evidence. Uses Lovable AI Gateway (Gemini) for
// robust, layout-tolerant extraction. No external API key needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return "sha256:" + Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const storagePath = String(body.storage_path ?? "").trim();
    if (!storagePath || !storagePath.startsWith(`${userId}/`)) {
      return new Response(JSON.stringify({ error: "Invalid storage_path" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download PDF (RLS allows owner)
    const { data: file, error: dlErr } = await userClient
      .storage.from("lms-transcripts").download(storagePath);
    if (dlErr || !file) throw new Error(dlErr?.message || "Could not download transcript");

    const buf = new Uint8Array(await file.arrayBuffer());
    // Base64 encode for AI gateway
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);

    const prompt = `You are parsing an academic transcript PDF.
Extract every course as a JSON array. Each item must have:
- course_name (string)
- course_code (string|null)
- grade (string|null, e.g. "A", "B+", "3.5", "85%")
- completion_status ("Completed" | "In Progress" | "Failed" | null)

Return ONLY valid JSON: { "courses": [...] }. No prose.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${b64}` },
              },
            ],
          },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI error ${aiRes.status}: ${t.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const text = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: { courses: Array<{ course_name: string; course_code?: string | null; grade?: string | null; completion_status?: string | null }> } = { courses: [] };
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch {
      throw new Error("Could not parse AI response");
    }

    const courses = Array.isArray(parsed.courses) ? parsed.courses : [];
    if (!courses.length) {
      return new Response(JSON.stringify({ success: true, fetched: 0, persisted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = await Promise.all(courses.map(async (c) => ({
      user_id: userId,
      source: "Transcript Upload",
      course_name: String(c.course_name ?? "Unknown course").slice(0, 200),
      course_code: c.course_code ? String(c.course_code).slice(0, 50) : null,
      grade: c.grade ? String(c.grade).slice(0, 20) : null,
      completion_status: c.completion_status ? String(c.completion_status).slice(0, 30) : "Completed",
      certificate_url: null,
      evidence_hash: await sha256Hex(`transcript:${storagePath}:${c.course_name}:${c.grade ?? ""}`),
      raw: c as unknown as Record<string, unknown>,
      text_preview: null,
    })));

    const { error: upErr, count } = await userClient
      .from("lms_evidence")
      .upsert(rows, { onConflict: "user_id,evidence_hash", count: "exact" });
    if (upErr) throw new Error(`DB upsert failed: ${upErr.message}`);

    return new Response(JSON.stringify({ success: true, fetched: rows.length, persisted: count ?? rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lms-transcript-parse error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { runGitHubSync } from "../_shared/github-sync-core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uerr } = await userClient.auth.getUser(token);
    if (uerr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    let declaredSkills: Array<{ id: string; name: string }> = [];
    try {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.declared_skills)) declaredSkills = body.declared_skills;
    } catch { /* no body */ }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await runGitHubSync(admin, userId, declaredSkills);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

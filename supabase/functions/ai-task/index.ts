const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { action, skill, repos, task, submission } = await req.json();
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

    let prompt = "";

    if (action === "generate") {
      const repoContext = repos?.length
        ? `The learner has these GitHub repos: ${repos.map((r) => `${r.full_name} (${r.language ?? "unknown"})`).join(", ")}.`
        : "";
      prompt = `Generate a 20-minute practical assessment task for a learner claiming the skill: "${skill.name}" (domain: "${skill.domain}"). ${repoContext} Return ONLY valid JSON (no markdown): {"title":"...","type":"Coding|Debugging|MCQ + Short Answer|Design|Hands-on","durationMinutes":20,"prompt":"2-4 sentence instructions","expectedDeliverable":"..."}`;
    } else if (action === "evaluate") {
      const repoContext = repos?.length
        ? `Learner repos: ${repos.map((r) => `${r.full_name} (${r.language ?? "unknown"})`).join(", ")}.`
        : "";
      prompt = `Evaluate this submission. ${repoContext}\nTask: ${task.title}\nInstructions: ${task.prompt}\nExpected: ${task.expectedDeliverable}\nSubmission:\n${submission}\n\nReturn ONLY valid JSON: {"passed":true|false,"score":0-100,"feedback":"2-3 sentences"}`;
    } else {
      throw new Error("Invalid action");
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
      }
    );
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    return new Response(clean, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

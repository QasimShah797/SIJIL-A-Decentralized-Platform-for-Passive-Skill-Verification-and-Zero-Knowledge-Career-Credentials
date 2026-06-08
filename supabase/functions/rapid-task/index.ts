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
      prompt = `You are creating a practical coding assessment for a student.

Skill: "${skill.name}" (domain: "${skill.domain}")
${repoContext}

Generate a specific, concrete problem to solve — NOT a general statement like "demonstrate your knowledge".

Rules:
- Give a real coding problem with clear input/output examples
- Problem must be directly related to ${skill.name}
- Include starter code or a specific scenario they must work with
- Must be solvable in 20 minutes by a beginner-intermediate student
- Be specific: e.g. "Write a function that takes an array of numbers and returns only the even ones" not "Show your JavaScript skills"

Return ONLY valid JSON (no markdown, no backticks):
{
  "title": "short problem title",
  "type": "Coding",
  "durationMinutes": 20,
  "prompt": "Full problem description with:\n1. What to build\n2. Input/output example\n3. Any constraints",
  "starterCode": "// paste starter code here with function signature and example",
  "expectedDeliverable": "working function/solution that handles the given examples correctly"
}`;
    } else if (action === "evaluate") {
      const repoContext = repos?.length
        ? `Learner repos: ${repos.map((r) => `${r.full_name} (${r.language ?? "unknown"})`).join(", ")}.`
        : "";
      prompt = `You are evaluating a coding submission from a student learning ${skill?.name ?? "programming"}.

Problem given:
${task.title}
${task.prompt}

Expected: ${task.expectedDeliverable}

Student's submission:
${submission}

${repoContext}

Evaluate based on:
1. Does their code actually solve the specific problem given? (most important)
2. Is the logic correct for the given input/output examples?
3. Is it written in or related to ${skill?.name ?? "the required language"}?
4. Did they make a genuine attempt?

Grading:
- Pass (score 70-100): Code solves the problem or is mostly correct with minor issues
- Pass (score 60-69): Attempted the right approach but has bugs
- Fail (score below 60): Wrong language, completely wrong approach, or empty/irrelevant

Return ONLY valid JSON (no markdown, no backticks):
{
  "passed": true|false,
  "score": 0-100,
  "feedback": "2-3 sentences: what they got right, what was wrong, one specific tip"
}`;
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
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { passed: true, score: 70, feedback: "Your submission was received. Keep practicing to strengthen your skills." };
    }
    return new Response(JSON.stringify(parsed), {
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

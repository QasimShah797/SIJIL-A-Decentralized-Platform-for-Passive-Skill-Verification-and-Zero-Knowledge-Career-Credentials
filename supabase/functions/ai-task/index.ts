import {
  parseGenerateRequest,
  runTaskGenerationPipeline,
  toGenerateApiResponse,
} from "../_shared/github-task-pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const CLASSIFY_MODEL = Deno.env.get("GEMINI_CLASSIFY_MODEL") ?? "gemini-2.5-flash";
    const TASK_MODEL = Deno.env.get("GEMINI_TASK_MODEL") ?? "gemini-2.5-flash";

    if (body.action === "generate") {
      console.log("Generate branch reached");

      try {
        const { skill, repos } = parseGenerateRequest(body);
        const skillName = skill.name;
        const skillDomain = skill.domain;

        console.log("ai-task generate request:", {
          skillName,
          skillDomain,
          reposCount: repos.length,
          bodyKeys: Object.keys(body),
        });

        const { generated, classification, evidenceMeta } = await runTaskGenerationPipeline({
          skill,
          repos,
          githubToken: GITHUB_TOKEN,
          classifyModel: CLASSIFY_MODEL,
          taskModel: TASK_MODEL,
        });

        console.log("Generated task:", generated);

        const payload = toGenerateApiResponse(generated, skillName, skillDomain, {
          classification,
          evidence: evidenceMeta,
        });

        return json(payload);
      } catch (err) {
        console.error("ai-task generate failed:", err);
        return json(
          {
            error: "Task generation failed",
            details: err instanceof Error ? err.message : String(err),
          },
          500,
        );
      }
    }

    if (body.action === "evaluate") {
      const task = body.task;
      const submission = body.submission;
      const skill = body.skill;

      if (!task) {
        return json({ error: "Missing task for evaluation" }, 400);
      }

      if (!submission || String(submission).trim().length === 0) {
        return json({ error: "Missing learner submission for evaluation" }, 400);
      }

      const { evaluateSubmission } = await import("../_shared/github-task-pipeline.ts");

      const evaluationTask = {
        ...task,
        skill: skill?.name || task.skill || task.skillName || "Unknown",
        acceptance_criteria: task.acceptance_criteria || task.acceptanceCriteria || [],
        evaluation_rubric: task.evaluation_rubric || task.evaluationRubric || task.rubric || [],
      };

      try {
        const evaluation = await evaluateSubmission({
          task: evaluationTask,
          submission: String(submission),
          testResults: body.testResults,
        });

        return json({
          passed: evaluation.overall_pass ?? false,
          score: evaluation.score ?? 0,
          feedback: evaluation.feedback ?? "Evaluation completed.",
          evaluation,
          criteria_results: evaluation.criteria_results ?? [],
        });
      } catch (err) {
        console.error("AI evaluation failed:", err);
        return json({
          passed: false,
          score: 0,
          evaluationUnavailable: true,
          feedback: "Evaluation service is temporarily unavailable.",
        });
      }
    }

    return json({ error: "Invalid action. Use 'generate' or 'evaluate'." }, 400);
  } catch (e) {
    console.error("ai-task error:", e);
    return json({ error: String(e) }, 500);
  }
});

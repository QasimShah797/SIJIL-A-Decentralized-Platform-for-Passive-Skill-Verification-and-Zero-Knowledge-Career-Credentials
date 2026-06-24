import {
  buildLocalFallbackGeneratePayload,
  hasAiProviderConfigured,
  isRecoverableAIError,
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

    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const CLASSIFY_MODEL = Deno.env.get("GEMINI_CLASSIFY_MODEL") ?? "gemini-2.5-flash";
    const TASK_MODEL = Deno.env.get("GEMINI_TASK_MODEL") ?? "gemini-2.5-flash";

    if (body.action === "generate") {
      console.log("Generate branch reached");

      const { skill, repos } = parseGenerateRequest(body);
      const skillName = skill.name;
      const skillDomain = skill.domain;

      if (!hasAiProviderConfigured()) {
        console.log("No AI providers configured, using local fallback task for:", skillName);
        return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
      }

      try {
        console.log("rapid-task generate request:", {
          skillName,
          skillDomain,
          reposCount: repos.length,
          bodyKeys: Object.keys(body),
        });
        console.log("Skill name:", skillName);
        console.log("Repos:", repos);

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
        console.error("All AI providers failed:", err);

        const message = err instanceof Error ? err.message : String(err);

        if (isRecoverableAIError(err)) {
          console.log("Using local fallback task for:", skillName);
          return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
        }

        return json(
          {
            error: "Task generation failed",
            details: message,
          },
          500,
        );
      }
    }

    if (body.action === "evaluate") {
      if (!hasAiProviderConfigured()) {
        return json({
          passed: false,
          score: 0,
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
        });
      }

      const task = body.task;
      const submission = body.submission;
      const skill = body.skill;

      console.log("Evaluation request received:", {
        hasTask: !!task,
        hasSubmission: !!submission,
        skill,
        taskTitle: task?.title,
      });

      if (!task) {
        return json(
          {
            error: "Missing task for evaluation",
            receivedKeys: Object.keys(body),
          },
          400,
        );
      }

      if (!submission || String(submission).trim().length === 0) {
        return json(
          {
            error: "Missing learner submission for evaluation",
            receivedKeys: Object.keys(body),
          },
          400,
        );
      }

      const { evaluateSubmission } = await import("../_shared/github-task-pipeline.ts");

      const evaluationTask = {
        ...task,
        skill: skill?.name || task.skill || task.skillName || "Unknown",
        acceptance_criteria:
          task.acceptance_criteria ||
          task.acceptanceCriteria ||
          task.acceptanceCriteriaJson ||
          [],
        evaluation_rubric:
          task.evaluation_rubric ||
          task.evaluationRubric ||
          task.rubric ||
          [],
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
          missing_requirements: evaluation.missing_requirements ?? [],
          improvement_suggestions: evaluation.improvement_suggestions ?? [],
        });
      } catch (err) {
        console.error("AI evaluation failed:", err);

        return json({
          passed: false,
          score: 0,
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
          evaluation: {
            overall_pass: false,
            score: 0,
            evaluationUnavailable: true,
            criteria_results: [
              {
                criterion: "Submission received",
                passed: true,
                reason: "The learner submission reached the backend successfully.",
              },
              {
                criterion: "AI evaluation service",
                passed: false,
                reason: err instanceof Error ? err.message : String(err),
              },
            ],
            missing_requirements: [],
            feedback:
              "The AI evaluation service failed before grading. Check Supabase Edge Function logs for provider error details.",
            improvement_suggestions: [
              "Set GEMINI_API_KEY and/or GROQ_API_KEY in Supabase secrets.",
              "Optional: AI_PROVIDERS=groq,gemini to prefer Groq first.",
              "Optional: GROQ_EVAL_MODEL=llama-3.3-70b-versatile",
              "Redeploy the rapid-task edge function after updating secrets.",
            ],
          },
        });
      }
    }

    return json({ error: "Invalid action. Use 'generate' or 'evaluate'." }, 400);
  } catch (e) {
    console.error("rapid-task error:", e);
    return json({ error: String(e) }, 500);
  }
});

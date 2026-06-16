import {
  classifyEvidence,
  collectRepoEvidence,
  evaluateSubmission,
  generateTask,
  pickBestRepo,
  resolveRepoSlug,
  toLegacyTaskResponse,
  type RepoRef,
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
    const { action, repos } = body;

    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? undefined;
    const CLASSIFY_MODEL = Deno.env.get("GEMINI_CLASSIFY_MODEL") ?? "gemini-3.5-flash";
    const TASK_MODEL = Deno.env.get("GEMINI_TASK_MODEL") ?? "gemini-3.5-flash";

    if (action === "generate") {
      const skill = body.skill;
      if (!skill?.name) {
        return json({ error: "skill.name is required for generate" }, 400);
      }

      const repoList = (repos ?? []) as RepoRef[];
      const chosen = pickBestRepo(repoList, skill.name);
      const slug = chosen ? resolveRepoSlug(chosen) : null;

      let evidence = { files: [] as Awaited<ReturnType<typeof collectRepoEvidence>>["files"], languages: {} as Record<string, number> };
      let repoLabel: string | null = null;

      if (slug) {
        repoLabel = `${slug.owner}/${slug.repo}`;
        evidence = await collectRepoEvidence(slug.owner, slug.repo, skill.name, GITHUB_TOKEN);
      }

      const classification = await classifyEvidence(skill, evidence, GEMINI_KEY, CLASSIFY_MODEL);
      const generated = await generateTask(skill, classification, GEMINI_KEY, TASK_MODEL);

      const payload = toLegacyTaskResponse(generated, classification, {
        repo: repoLabel,
        fileCount: evidence.files.length,
      });

      return json(payload);
    }

    if (body.action === "evaluate") {
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
              "The AI evaluation service failed before grading. Check Supabase Edge Function logs for Gemini error details.",
            improvement_suggestions: [
              "Check GEMINI_API_KEY.",
              "Check GEMINI_EVAL_MODEL.",
              "Use gemini-2.5-flash for evaluation.",
              "Check responseSchema format.",
            ],
          },
        });
      }
    }

    return json({ error: "Invalid action. Use 'generate' or 'evaluate'." }, 400);
  } catch (e) {
    console.error("ai-task error:", e);
    return json({ error: String(e) }, 500);
  }
});

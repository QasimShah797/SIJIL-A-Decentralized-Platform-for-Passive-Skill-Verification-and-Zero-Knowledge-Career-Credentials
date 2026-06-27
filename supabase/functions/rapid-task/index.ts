import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  buildLocalFallbackGeneratePayload,
  collectSkillEvidence,
  generateTask,
  hasAiProviderConfigured,
  isRecoverableAIError,
  parseGenerateRequest,
  toGenerateApiResponse,
} from "../_shared/github-task-pipeline.ts";
import {
  buildAnswerKeyEntries,
  generateMcqTask,
  parseMcqGenerateBody,
  scoreMcqSubmission,
  stripQuestionForLearner,
} from "../_shared/mcq-pipeline.ts";

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

async function resolveUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  return { userId: userData.user.id, admin };
}

async function fetchLmsSnippets(
  admin: ReturnType<typeof createClient>,
  userId: string,
  skillId?: string,
): Promise<string[]> {
  if (!skillId) return [];

  const { data: lmsRows } = await admin
    .from("lms_evidence")
    .select("title, source, course_name, fetched_at")
    .eq("user_id", userId)
    .eq("linked_skill_id", skillId)
    .order("fetched_at", { ascending: false })
    .limit(10);

  return (lmsRows ?? []).map((row) => {
    const title = row.title ?? row.course_name ?? "LMS item";
    return `${title} (${row.source ?? "LMS"})`;
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
      const { skill, repos, variationSeed } = parseGenerateRequest(body);
      const skillName = skill.name;
      const skillDomain = skill.domain ?? "General";

      const { classification, evidence, evidenceMeta } = await collectSkillEvidence({
        skill,
        repos,
        githubToken: GITHUB_TOKEN,
        classifyModel: CLASSIFY_MODEL,
      });

      if (body.taskType === "mcq") {
        const auth = await resolveUser(req);
        if ("error" in auth && auth.error) return auth.error;
        const { userId, admin } = auth as { userId: string; admin: ReturnType<typeof createClient> };

        const parsed = parseMcqGenerateBody(body);
        const skillId = parsed.skillId;
        const lmsSnippets = await fetchLmsSnippets(admin, userId, skillId);

        const { test, fallback } = await generateMcqTask({
          skillName,
          skillDomain,
          classification,
          evidenceFiles: evidence.files,
          evidenceLanguages: evidence.languages,
          repo: evidenceMeta.repo,
          taskModel: TASK_MODEL,
          variationSeed: variationSeed ?? crypto.randomUUID(),
          lmsSnippets,
        });

        const learnerQuestions = test.questions.map(stripQuestionForLearner);
        const answerKey = buildAnswerKeyEntries(test.questions);

        const evidencePackage = {
          githubEvidence: {
            repo: evidenceMeta.repo,
            fileCount: evidenceMeta.fileCount,
          },
          classification,
        };

        const { data: attempt, error: attemptError } = await admin
          .from("mcq_task_attempts")
          .insert({
            learner_user_id: userId,
            skill_id: skillId ?? null,
            competency_name: skillName,
            competency_domain: skillDomain,
            questions: learnerQuestions,
            answer_key: answerKey,
            status: "in_progress",
            passed: false,
            title: test.title,
            duration_minutes: test.durationMinutes || 15,
            evidence_package: evidencePackage,
            classification,
          })
          .select("id")
          .single();

        if (attemptError || !attempt) {
          console.error("mcq_task_attempts insert error:", attemptError);
          return json({ error: "Could not create MCQ attempt", details: attemptError?.message }, 500);
        }

        return json({
          attemptId: attempt.id,
          title: test.title,
          type: "MCQ",
          durationMinutes: test.durationMinutes || 15,
          questions: learnerQuestions,
          skill: skillName,
          domain: skillDomain,
          classification,
          evidence: {
            repo: evidenceMeta.repo,
            fileCount: evidenceMeta.fileCount,
          },
          fallback,
        });
      }

      if (!hasAiProviderConfigured()) {
        console.log("No AI providers configured, using local fallback task for:", skillName);
        return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
      }

      try {
        let generated;
        try {
          generated = await generateTask(skill, classification, "", TASK_MODEL, variationSeed);
        } catch (genErr) {
          console.error("generateTask failed, retrying:", genErr);
          generated = await generateTask(
            skill,
            classification,
            "",
            TASK_MODEL,
            variationSeed ? `${variationSeed}-retry` : undefined,
          );
        }

        if (!generated?.questions || generated.questions.length < 5) {
          throw new Error("AI returned incomplete question set");
        }
        if (!generated?.title || (!generated.scenario && !generated.instructions)) {
          throw new Error("AI returned incomplete task");
        }

        const payload = toGenerateApiResponse(generated, skillName, skillDomain, {
          classification,
          evidence: evidenceMeta,
        });
        payload.aiGenerated = true;
        payload.variationSeed = variationSeed;

        return json(payload);
      } catch (err) {
        console.error("All AI providers failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        if (isRecoverableAIError(err)) {
          return json(buildLocalFallbackGeneratePayload(skillName, skillDomain));
        }
        return json({ error: "Task generation failed", details: message }, 500);
      }
    }

    if (body.action === "evaluate") {
      if (body.taskType === "mcq") {
        const auth = await resolveUser(req);
        if ("error" in auth && auth.error) return auth.error;
        const { userId, admin } = auth as { userId: string; admin: ReturnType<typeof createClient> };

        const attemptId = String(body.attemptId ?? "");
        const answers = (body.answers ?? {}) as Record<string, string>;

        if (!attemptId) {
          return json({ error: "Missing attemptId" }, 400);
        }

        const { data: attempt, error: fetchErr } = await admin
          .from("mcq_task_attempts")
          .select(`
            id,
            learner_user_id,
            skill_id,
            competency_name,
            competency_domain,
            questions,
            answer_key,
            status,
            title,
            evidence_package,
            classification
          `)
          .eq("id", attemptId)
          .maybeSingle();

        if (fetchErr) return json({ error: fetchErr.message }, 500);
        if (!attempt) return json({ error: "MCQ attempt not found" }, 404);
        if (attempt.learner_user_id !== userId) return json({ error: "Forbidden" }, 403);
        if (attempt.status !== "in_progress") {
          return json({ error: "MCQ attempt already submitted" }, 400);
        }

        const { correctCount, totalQuestions, percentage, passed } = scoreMcqSubmission(
          attempt.answer_key,
          answers,
        );
        const submittedAt = new Date().toISOString();

        const { error: updateErr } = await admin
          .from("mcq_task_attempts")
          .update({
            learner_answers: answers,
            correct_count: correctCount,
            total_questions: totalQuestions,
            percentage,
            passed,
            status: "completed",
            feedback: "MCQ test submitted and saved.",
            submitted_at: submittedAt,
          })
          .eq("id", attemptId);

        if (updateErr) {
          return json({ error: updateErr.message }, 500);
        }

        const storedEvidence = attempt.evidence_package as Record<string, unknown> | null;
        const storedClassification = attempt.classification as Record<string, unknown> | null;

        const evidencePackage = {
          competency: {
            skillId: attempt.skill_id,
            name: attempt.competency_name,
            domain: attempt.competency_domain,
          },
          practicalTask: {
            type: "MCQ",
            attemptId,
            percentage,
            correctCount,
            totalQuestions,
            submittedAt,
          },
          mcqQuestions: attempt.questions,
          learnerAnswers: answers,
          githubEvidence: storedEvidence?.githubEvidence || storedEvidence || null,
          classification: storedClassification || null,
        };

        const { data: learnerProfile } = await admin
          .from("learner_profiles")
          .select("first_name, last_name, university_email, institution_name, student_id, program, batch")
          .eq("user_id", userId)
          .maybeSingle();

        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const learnerEmail = learnerProfile?.university_email ?? authUser?.user?.email ?? "";
        const learnerName = [learnerProfile?.first_name, learnerProfile?.last_name]
          .filter(Boolean)
          .join(" ")
          || String(authUser?.user?.user_metadata?.full_name ?? "");

        let attestationRequestId: string | null = null;

        let existingAttestationQuery = admin
          .from("institution_attestation_requests")
          .select("id")
          .eq("learner_user_id", userId)
          .eq("status", "pending");

        existingAttestationQuery = attempt.skill_id
          ? existingAttestationQuery.eq("skill_id", attempt.skill_id)
          : existingAttestationQuery.is("skill_id", null);

        const { data: existingAttestation } = await existingAttestationQuery.maybeSingle();

        if (!existingAttestation) {
          const institutionName =
            (storedEvidence?.institution_name as string | undefined)
            || learnerProfile?.institution_name
            || "Capital University of Science and Technology";

          const { data: attestationRequest, error: attestationError } = await admin
            .from("institution_attestation_requests")
            .insert({
              learner_user_id: userId,
              learner_name: learnerName,
              learner_email: learnerEmail,
              skill_id: attempt.skill_id || null,
              competency_name: attempt.competency_name,
              competency_domain: attempt.competency_domain,
              institution_name: institutionName,
              status: "pending",
              current_stage: "institution_attestation_pending",
              evidence_package: evidencePackage,
              practical_task_result: {
                type: "MCQ",
                title: attempt.title ?? `${attempt.competency_name} MCQ`,
                attemptId,
                percentage,
                scorePercent: percentage,
                correctCount,
                totalQuestions,
                submittedAt,
              },
              mcq_result: {
                attemptId,
                percentage,
                correctCount,
                totalQuestions,
              },
              test_percentage: percentage,
              github_evidence: storedEvidence?.githubEvidence
                ? [storedEvidence.githubEvidence as Record<string, unknown>]
                : [],
              submitted_to_institution_at: submittedAt,
            })
            .select("id")
            .single();

          if (attestationError) {
            console.error("Attestation request insert error:", attestationError);
          } else if (attestationRequest?.id) {
            attestationRequestId = attestationRequest.id;
            await admin
              .from("mcq_task_attempts")
              .update({
                institution_attestation_request_id: attestationRequest.id,
                sent_to_institution_at: submittedAt,
              })
              .eq("id", attemptId);
          }
        } else {
          attestationRequestId = existingAttestation.id;
        }

        if (attempt.skill_id) {
          await admin
            .from("declared_skills")
            .update({
              pipeline_stage: "institution_attestation_pending",
              status: "pending_institution_attestation",
            })
            .eq("id", attempt.skill_id)
            .eq("user_id", userId);
        }

        return json({
          submitted: true,
          percentage,
          message: `Test submitted successfully. Your result is ${percentage}% and has been sent to your institution for attestation.`,
        });
      }

      if (!hasAiProviderConfigured()) {
        return json({
          passed: false,
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
        });
      }

      const task = body.task;
      const submission = body.submission;
      const skill = body.skill;

      if (!task) {
        return json({ error: "Missing task for evaluation", receivedKeys: Object.keys(body) }, 400);
      }
      if (!submission || String(submission).trim().length === 0) {
        return json({ error: "Missing learner submission for evaluation", receivedKeys: Object.keys(body) }, 400);
      }

      const { evaluateSubmission } = await import("../_shared/github-task-pipeline.ts");
      const evaluationTask = {
        ...task,
        skill: skill?.name || task.skill || task.skillName || "Unknown",
        acceptance_criteria: task.acceptance_criteria || task.acceptanceCriteria || task.acceptanceCriteriaJson || [],
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
          evaluationUnavailable: true,
          feedback:
            "Evaluation service is temporarily unavailable. The learner submission was received, but it was not graded.",
        });
      }
    }

    return json({ error: "Invalid action. Use 'generate' or 'evaluate'." }, 400);
  } catch (e) {
    console.error("rapid-task error:", e);
    return json({ error: String(e) }, 500);
  }
});

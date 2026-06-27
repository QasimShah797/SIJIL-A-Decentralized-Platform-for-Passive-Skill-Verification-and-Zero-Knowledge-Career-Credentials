import type { DeclaredSkill } from "@/lib/sijil-data";

export type McqOptionId = "A" | "B" | "C" | "D";
export type McqDifficulty = "easy" | "medium" | "hard";

export type McqOption = {
  id: McqOptionId;
  text: string;
};

/** Learner-safe question — never includes correctOptionId or explanation */
export type McqQuestion = {
  id: string;
  question: string;
  options: McqOption[];
  difficulty: McqDifficulty;
};

export type McqTask = {
  attemptId: string;
  title: string;
  type: "MCQ";
  durationMinutes: number;
  questions: McqQuestion[];
};

export type McqAnswerMap = Record<string, McqOptionId>;

export type McqProgress = {
  answers: McqAnswerMap;
  currentIndex: number;
  questionEndsAt: string;
};

export type TaskMode = "MCQ" | "Coding";

export const MCQ_SECONDS_PER_QUESTION = 60;

export type McqSessionEnvelope = {
  _mcqSession: true;
  attemptId: string;
  task: Omit<McqTask, "attemptId">;
  progress?: McqProgress;
  resultPercentage?: number;
  resultMessage?: string;
};

export function createInitialMcqProgress(): McqProgress {
  return {
    answers: {},
    currentIndex: 0,
    questionEndsAt: new Date(Date.now() + MCQ_SECONDS_PER_QUESTION * 1000).toISOString(),
  };
}

export function serializeMcqSession(envelope: McqSessionEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseMcqSession(submission: string): McqSessionEnvelope | null {
  if (!submission.trim()) return null;
  try {
    const parsed = JSON.parse(submission) as Record<string, unknown>;
    if (parsed?._mcqSession !== true || !parsed.task || typeof parsed.task !== "object") return null;
    const task = parsed.task as Omit<McqTask, "attemptId">;
    if (!Array.isArray(task.questions)) return null;
    return {
      _mcqSession: true,
      attemptId: String(parsed.attemptId ?? ""),
      task,
      progress: parsed.progress as McqProgress | undefined,
      resultPercentage: parsed.resultPercentage as number | undefined,
      resultMessage: parsed.resultMessage as string | undefined,
    };
  } catch {
    return null;
  }
}

export function parseMcqAnswers(submission: string): McqAnswerMap {
  const session = parseMcqSession(submission);
  if (session?.progress?.answers) return session.progress.answers;
  return {};
}

export function parseMcqProgress(submission: string): McqProgress | null {
  return parseMcqSession(submission)?.progress ?? null;
}

export function restoreMcqTaskFromSubmission(submission: string): McqTask | null {
  const session = parseMcqSession(submission);
  if (!session?.attemptId) return null;
  return {
    attemptId: session.attemptId,
    ...session.task,
  };
}

export function parseGenerateMcqResponse(data: Record<string, unknown>): McqTask | null {
  const attemptId = String(data.attemptId ?? "");
  const rawQuestions = data.questions;
  if (!attemptId || !Array.isArray(rawQuestions) || rawQuestions.length === 0) return null;

  const questions: McqQuestion[] = rawQuestions
    .map((item, i) => {
      const row = item as Record<string, unknown>;
      const optionsRaw = Array.isArray(row.options) ? row.options : [];
      const options: McqOption[] = optionsRaw
        .map((opt) => {
          const o = opt as Record<string, unknown>;
          const id = String(o.id ?? "").toUpperCase();
          if (id !== "A" && id !== "B" && id !== "C" && id !== "D") return null;
          const text = String(o.text ?? "").trim();
          if (!text) return null;
          return { id: id as McqOptionId, text };
        })
        .filter((o): o is McqOption => o !== null);

      const question = String(row.question ?? "").trim();
      if (!question || options.length < 2) return null;

      const difficulty = String(row.difficulty ?? "medium").toLowerCase();
      return {
        id: String(row.id ?? `q${i + 1}`),
        question,
        options,
        difficulty: (difficulty === "easy" || difficulty === "hard" ? difficulty : "medium") as McqDifficulty,
      };
    })
    .filter((q): q is McqQuestion => q !== null);

  if (questions.length === 0) return null;

  const taskType = String(data.type ?? "").toUpperCase();
  if (taskType && taskType !== "MCQ") return null;

  return {
    attemptId,
    title: String(data.title ?? "MCQ Assessment"),
    type: "MCQ",
    durationMinutes: Number(data.durationMinutes ?? 15),
    questions,
  };
}

export async function generateSecureMcqTask(
  skill: DeclaredSkill,
  repos: { name: string; language: string | null; full_name: string }[],
  invoke: (body: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: Error | null }>,
): Promise<McqTask> {
  const matchedRepos = repos.filter((r) =>
    r.language?.toLowerCase().includes(skill.name.toLowerCase())
    || skill.name.toLowerCase().includes((r.language ?? "").toLowerCase()),
  );

  const { data, error } = await invoke({
    action: "generate",
    taskType: "mcq",
    skill: { id: skill.id, name: skill.name, domain: skill.domain ?? "General" },
    declaredSkill: skill.name,
    repos: matchedRepos.length ? matchedRepos : repos,
  });

  if (error) {
    throw new Error(error.message || "MCQ generation failed");
  }
  if (!data || data.error) {
    throw new Error(String(data.details ?? data.error ?? "MCQ generation failed"));
  }

  const parsed = parseGenerateMcqResponse(data);
  if (!parsed) {
    throw new Error("Invalid MCQ response from server.");
  }

  return parsed;
}

export async function evaluateSecureMcqAttempt(
  attemptId: string,
  answers: McqAnswerMap,
  invoke: (body: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: Error | null }>,
): Promise<{ submitted: boolean; percentage: number; message: string }> {
  const { data, error } = await invoke({
    action: "evaluate",
    taskType: "mcq",
    attemptId,
    answers,
  });

  if (error) {
    throw new Error(error.message || "MCQ evaluation failed");
  }
  if (!data || data.error) {
    throw new Error(String(data.details ?? data.error ?? "MCQ evaluation failed"));
  }

  return {
    submitted: data.submitted === true,
    percentage: Number(data.percentage ?? 0),
    message: String(data.message ?? "Test submitted successfully."),
  };
}

export function formatMcqSubmissionSummary(
  questions: McqQuestion[],
  answers: McqAnswerMap,
): string {
  return questions
    .map((question, index) => {
      const selected = answers[question.id];
      const option = question.options.find((o) => o.id === selected);
      const label = option?.text ?? "No answer";
      return `${index + 1}. ${question.question}\n   Answer: ${selected ?? "—"} — ${label}`;
    })
    .join("\n\n");
}

import type { DeclaredSkill } from "@/lib/sijil-data";

export type McqOptionId = "A" | "B" | "C" | "D";
export type McqDifficulty = "easy" | "medium" | "hard";
export type McqQuestionKind = "concept" | "code";
export type ClosedQuestionType =
  | "single"
  | "scenario"
  | "case"
  | "multi"
  | "boolean"
  | "code-output"
  | "debug"
  | "order"
  | "match"
  | "hotspot";

export type ExamItem = { id: string; text: string };
export type AssessmentAnswerValue = string | string[] | Record<string, string>;

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
  kind: McqQuestionKind;
  seconds: number;
  type: ClosedQuestionType;
  code?: string;
  language?: string;
  scenario?: string;
  caseId?: string;
  caseTitle?: string;
  orderItems?: ExamItem[];
  matchLeft?: ExamItem[];
  matchRight?: ExamItem[];
  selectionNote?: string;
};

export type McqTask = {
  attemptId: string;
  title: string;
  type: "MCQ";
  durationMinutes: number;
  questions: McqQuestion[];
};

export type McqAnswerMap = Record<string, AssessmentAnswerValue>;

export function isResponsePresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function questionTypeOf(question: { type?: string; kind?: string; code?: string }): ClosedQuestionType {
  const allowed: ClosedQuestionType[] = [
    "single", "scenario", "case", "multi", "boolean", "code-output", "debug", "order", "match", "hotspot",
  ];
  if (question.type && allowed.includes(question.type as ClosedQuestionType)) {
    return question.type as ClosedQuestionType;
  }
  if (question.kind === "code" || question.code) return "debug";
  return "single";
}

export type McqProgress = {
  answers: McqAnswerMap;
  currentIndex: number;
  questionEndsAt: string;
  remainingByQuestion?: Record<string, number>;
};

export type TaskMode = "MCQ" | "Coding";

export const MCQ_SECONDS_PER_QUESTION = 30;
export const MCQ_CONCEPT_COUNT = 10;
export const MCQ_CODE_COUNT = 4;

export function totalMcqSeconds(questions: readonly unknown[]): number {
  return questions.length * MCQ_SECONDS_PER_QUESTION;
}

export function moveMcqQuestionTimer(
  remaining: Record<string, number>,
  currentId: string,
  currentDeadline: string,
  nextId: string,
  now: number,
) {
  const remainingByQuestion = {
    ...remaining,
    [currentId]: Math.max(0, Math.min(MCQ_SECONDS_PER_QUESTION * 1000, Date.parse(currentDeadline) - now)),
  };
  const nextRemaining = remainingByQuestion[nextId] ?? MCQ_SECONDS_PER_QUESTION * 1000;
  return { remainingByQuestion, questionEndsAt: new Date(now + nextRemaining).toISOString() };
}

export type McqSessionEnvelope = {
  _mcqSession: true;
  attemptId: string;
  task: Omit<McqTask, "attemptId">;
  progress?: McqProgress;
  resultPercentage?: number;
  resultCorrectCount?: number;
  resultTotalQuestions?: number;
  resultMessage?: string;
  resultLabel?: string;
  passed?: boolean;
};

export function createInitialMcqProgress(seconds = MCQ_SECONDS_PER_QUESTION): McqProgress {
  return {
    answers: {},
    currentIndex: 0,
    questionEndsAt: new Date(Date.now() + seconds * 1000).toISOString(),
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
      resultCorrectCount: parsed.resultCorrectCount as number | undefined,
      resultTotalQuestions: parsed.resultTotalQuestions as number | undefined,
      resultMessage: parsed.resultMessage as string | undefined,
      resultLabel: parsed.resultLabel as string | undefined,
      passed: parsed.passed as boolean | undefined,
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
      if (!question) return null;

      const difficulty = String(row.difficulty ?? "medium").toLowerCase();
      const code = String(row.code ?? "").trim();
      const kind: McqQuestionKind = String(row.kind ?? "").toLowerCase() === "code" || code ? "code" : "concept";
      const language = String(row.language ?? "").trim();
      const type = questionTypeOf({ type: String(row.type ?? ""), kind, code });
      const readItems = (value: unknown) => Array.isArray(value)
        ? value.flatMap((item) => {
          const rowItem = item as Record<string, unknown>;
          const id = String(rowItem.id ?? "").trim();
          const text = String(rowItem.text ?? "").trim();
          return id && text ? [{ id, text }] : [];
        })
        : [];
      const orderItems = readItems(row.orderItems);
      const matchLeft = readItems(row.matchLeft);
      const matchRight = readItems(row.matchRight);
      if (type === "order" && orderItems.length < 2) return null;
      if (type === "match" && (matchLeft.length < 2 || matchRight.length < 2)) return null;
      if (type !== "order" && type !== "match" && options.length < 2) return null;
      return {
        id: String(row.id ?? `q${i + 1}`),
        question,
        options,
        difficulty: (kind === "code" ? "hard" : difficulty === "easy" || difficulty === "hard" ? difficulty : "medium") as McqDifficulty,
        kind,
        type,
        seconds: MCQ_SECONDS_PER_QUESTION,
        ...(code ? { code } : {}),
        ...(language ? { language } : {}),
        ...(String(row.scenario ?? "").trim() ? { scenario: String(row.scenario) } : {}),
        ...(String(row.caseId ?? "").trim() ? { caseId: String(row.caseId) } : {}),
        ...(String(row.caseTitle ?? "").trim() ? { caseTitle: String(row.caseTitle) } : {}),
        ...(String(row.selectionNote ?? "").trim() ? { selectionNote: String(row.selectionNote) } : {}),
        ...(orderItems.length ? { orderItems } : {}),
        ...(matchLeft.length ? { matchLeft } : {}),
        ...(matchRight.length ? { matchRight } : {}),
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
    durationMinutes: Number(data.durationMinutes ?? 18),
    questions,
  };
}

export async function generateSecureMcqTask(
  skill: DeclaredSkill,
  repos: { name: string; language: string | null; full_name: string }[],
  invoke: (body: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: Error | null }>,
): Promise<McqTask> {
  const skillName = skill.name.trim().toLowerCase();
  const matchedRepos = repos.filter((r) => {
    const language = (r.language ?? "").toLowerCase();
    const name = (r.name ?? "").toLowerCase();
    const fullName = (r.full_name ?? "").toLowerCase();
    if (!skillName) return false;
    return (
      name.includes(skillName)
      || skillName.includes(name)
      || fullName.includes(skillName)
      || language.includes(skillName)
      || skillName.includes(language)
    );
  });

  const { data, error } = await invoke({
    action: "generate",
    taskType: "mcq",
    skill: { id: skill.id, name: skill.name },
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

/** Kept for older UI copy; progression no longer uses a pass mark. */
export const MCQ_PASS_PERCENT = 0;

/** Any numeric score advances the skill — there is no fail threshold. */
export function isMcqPassed(percentage: number | null | undefined): boolean {
  return typeof percentage === "number" && Number.isFinite(percentage);
}

export function mcqResultLabel(
  percentage: number | null | undefined,
  _passed?: boolean | null,
  attemptNumber?: number,
): string | null {
  if (percentage == null) return null;
  if (typeof attemptNumber === "number" && attemptNumber > 1) return "Retake";
  return "Completed";
}

export async function evaluateSecureMcqAttempt(
  attemptId: string,
  answers: McqAnswerMap,
  invoke: (body: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: Error | null }>,
): Promise<{
  submitted: boolean;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  resultLabel: string;
  attestationSent: boolean;
  message: string;
}> {
  const payload = Object.fromEntries(
    Object.entries(answers).filter(([, value]) => value != null),
  );

  console.log("[mcq-submit] attemptId:", attemptId);
  console.log("[mcq-submit] selected answers:", payload);

  const { data, error } = await invoke({
    action: "evaluate",
    taskType: "mcq",
    attemptId,
    answers: payload,
  });

  if (error) {
    throw new Error(error.message || "MCQ evaluation failed");
  }
  if (!data || data.error) {
    throw new Error(String(data.details ?? data.error ?? "MCQ evaluation failed"));
  }

  const percentage = Number(data.percentage ?? 0);
  const passed = isMcqPassed(percentage);
  const resultLabel = mcqResultLabel(percentage, passed) ?? "Completed";

  console.log("[mcq-submit] server result:", {
    percentage,
    correctCount: data.correctCount,
    totalQuestions: data.totalQuestions,
    passed,
    resultLabel,
  });

  return {
    submitted: data.submitted === true,
    percentage,
    correctCount: Number(data.correctCount ?? 0),
    totalQuestions: Number(data.totalQuestions ?? 0),
    passed,
    resultLabel,
    attestationSent: data.attestationSent === true,
    message: String(data.message ?? "Test submitted successfully."),
  };
}

export function buildMcqSubmissionAnswers(task: McqTask, answers: McqAnswerMap): McqAnswerMap {
  const payload: McqAnswerMap = {};
  for (const question of task.questions) {
    const selected = answers[question.id];
    if (selected) payload[question.id] = selected;
  }
  return payload;
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

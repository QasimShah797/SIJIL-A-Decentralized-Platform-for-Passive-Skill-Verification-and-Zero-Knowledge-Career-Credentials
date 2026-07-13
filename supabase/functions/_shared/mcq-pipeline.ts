import {
  formatEvidenceForPrompt,
  hasAiProviderConfigured,
  isRecoverableAIError,
  llmJson,
  parseGenerateRequest,
  type ClassificationResult,
  type EvidenceFile,
} from "./github-task-pipeline.ts";

export type McqOptionId = "A" | "B" | "C" | "D";
export type McqDifficulty = "easy" | "medium" | "hard";

export type McqOption = {
  id: McqOptionId;
  text: string;
};

export type McqQuestionFull = {
  id: string;
  question: string;
  options: McqOption[];
  correctOptionId: McqOptionId;
  explanation: string;
  difficulty: McqDifficulty;
};

export type McqQuestionSafe = {
  id: string;
  question: string;
  options: McqOption[];
  difficulty: McqDifficulty;
};

export type GeneratedMcqTest = {
  title: string;
  type: "MCQ";
  durationMinutes: number;
  questions: McqQuestionFull[];
};

const MCQ_PASS_THRESHOLD = 0.7;
export const MCQ_PASS_PERCENT = Math.round(MCQ_PASS_THRESHOLD * 100);

const MCQ_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string" },
    durationMinutes: { type: "number" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" },
              },
              required: ["id", "text"],
            },
          },
          correctOptionId: { type: "string" },
          explanation: { type: "string" },
          difficulty: { type: "string" },
        },
        required: ["id", "question", "options", "correctOptionId", "explanation", "difficulty"],
      },
    },
  },
  required: ["title", "type", "durationMinutes", "questions"],
};

function normalizeOptionId(value: unknown): McqOptionId | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
    return (["A", "B", "C", "D"] as const)[value];
  }
  const id = String(value ?? "").trim().toUpperCase();
  if (id === "A" || id === "B" || id === "C" || id === "D") return id;
  return null;
}

function normalizeDifficulty(value: unknown): McqDifficulty {
  const d = String(value ?? "medium").toLowerCase();
  if (d === "easy" || d === "hard") return d;
  return "medium";
}

export function stripQuestionForLearner(question: McqQuestionFull): McqQuestionSafe {
  return {
    id: question.id,
    question: question.question,
    options: question.options.map((o) => ({ id: o.id, text: o.text })),
    difficulty: question.difficulty,
  };
}

export type McqAnswerKeyEntry = {
  id: string;
  correctOptionId: McqOptionId;
  explanation: string;
};

function readCorrectOptionId(row: Record<string, unknown>): McqOptionId | null {
  return normalizeOptionId(
    row.correctOptionId
      ?? row.correct_option_id
      ?? row.correctAnswer
      ?? row.correct_answer
      ?? row.correctOption
      ?? row.correct_option
      ?? row.answer
      ?? row.correct_index
      ?? row.correctIndex,
  );
}

function readQuestionId(row: Record<string, unknown>, index: number): string {
  return String(row.id ?? row.question_id ?? row.questionId ?? `q${index + 1}`).trim();
}

function canonicalQuestionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseAnswerKeyEntries(answerKeyRaw: unknown): McqAnswerKeyEntry[] {
  if (Array.isArray(answerKeyRaw)) {
    return answerKeyRaw
      .map((item, index) => {
        const row = item as Record<string, unknown>;
        const id = readQuestionId(row, index);
        const correctOptionId = readCorrectOptionId(row);
        if (!id || !correctOptionId) return null;
        return {
          id,
          correctOptionId,
          explanation: String(row.explanation ?? row.rationale ?? ""),
        };
      })
      .filter((entry): entry is McqAnswerKeyEntry => entry !== null);
  }

  return Object.entries(normalizeAnswerKey(answerKeyRaw)).map(([id, correctOptionId]) => ({
    id,
    correctOptionId,
    explanation: "",
  }));
}

export function normalizeLearnerAnswers(answers: Record<string, unknown>): Record<string, McqOptionId> {
  const normalized: Record<string, McqOptionId> = {};
  for (const [questionId, value] of Object.entries(answers ?? {})) {
    const key = questionId.trim();
    if (!key) continue;

    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
      normalized[key] = (["A", "B", "C", "D"] as const)[value];
      continue;
    }

    const optionId = normalizeOptionId(value);
    if (optionId) normalized[key] = optionId;
  }
  return normalized;
}

function normalizeAnswerKeyValue(value: unknown): McqOptionId | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return readCorrectOptionId(value as Record<string, unknown>);
  }
  return normalizeOptionId(value);
}

export function scoreMcqSubmission(
  answerKeyRaw: unknown,
  answers: Record<string, unknown>,
): {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
} {
  const entries = parseAnswerKeyEntries(answerKeyRaw);
  const normalizedAnswers = normalizeLearnerAnswers(answers);
  const canonicalAnswers = new Map<string, McqOptionId>();
  for (const [questionId, option] of Object.entries(normalizedAnswers)) {
    const canonical = canonicalQuestionId(questionId);
    if (canonical) canonicalAnswers.set(canonical, option);
  }

  const totalQuestions = entries.length;
  const correctCount = entries.filter(
    (item) => {
      const direct = normalizedAnswers[item.id];
      if (direct != null) return direct === item.correctOptionId;
      const canonical = canonicalQuestionId(item.id);
      if (!canonical) return false;
      return canonicalAnswers.get(canonical) === item.correctOptionId;
    },
  ).length;
  const percentage = totalQuestions > 0
    ? Math.round((correctCount / totalQuestions) * 100)
    : 0;
  const passed = totalQuestions > 0
    ? correctCount / totalQuestions >= MCQ_PASS_THRESHOLD
    : false;

  return { correctCount, totalQuestions, percentage, passed };
}

export function buildAnswerKeyEntries(questions: McqQuestionFull[]): McqAnswerKeyEntry[] {
  return questions.map((q) => ({
    id: q.id,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
  }));
}

export function buildAnswerKey(questions: McqQuestionFull[]): Record<string, McqOptionId> {
  const key: Record<string, McqOptionId> = {};
  for (const q of questions) {
    key[q.id] = q.correctOptionId;
  }
  return key;
}

function normalizeAnswerKey(raw: unknown): Record<string, McqOptionId> {
  if (Array.isArray(raw)) {
    const key: Record<string, McqOptionId> = {};
    for (const item of raw) {
      const row = item as Record<string, unknown>;
      const id = readQuestionId(row, Object.keys(key).length);
      const correct = readCorrectOptionId(row);
      if (id && correct) key[id] = correct;
    }
    return key;
  }

  if (raw && typeof raw === "object") {
    const key: Record<string, McqOptionId> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const correct = normalizeAnswerKeyValue(value);
      if (correct) key[id] = correct;
    }
    return key;
  }

  return {};
}

function normalizeQuestion(raw: Record<string, unknown>, index: number): McqQuestionFull | null {
  const optionsRaw = Array.isArray(raw.options) ? raw.options : [];
  const options: McqOption[] = optionsRaw
    .map((opt, i) => {
      const row = opt as Record<string, unknown>;
      const id = normalizeOptionId(row.id ?? ["A", "B", "C", "D"][i]);
      const text = String(row.text ?? "").trim();
      if (!id || !text) return null;
      return { id, text };
    })
    .filter((o): o is McqOption => o !== null);

  while (options.length < 4) {
    const ids: McqOptionId[] = ["A", "B", "C", "D"];
    const id = ids[options.length];
    options.push({ id, text: `Option ${id}` });
  }

  const correctOptionId = normalizeOptionId(
    raw.correctOptionId
      ?? raw.correct_option_id
      ?? raw.correctAnswer
      ?? raw.correct_answer
      ?? raw.correctOption
      ?? raw.correct_option
      ?? raw.answer
      ?? (typeof raw.correct_index === "number"
        ? (["A", "B", "C", "D"] as const)[raw.correct_index as number]
        : raw.correct_index)
      ?? (typeof raw.correctIndex === "number"
        ? (["A", "B", "C", "D"] as const)[raw.correctIndex as number]
        : raw.correctIndex),
  ) ?? "A";
  const question = String(raw.question ?? "").trim();
  if (!question) return null;

  return {
    id: String(raw.id ?? `q${index + 1}`),
    question,
    options: options.slice(0, 4),
    correctOptionId,
    explanation: String(raw.explanation ?? "No explanation provided."),
    difficulty: normalizeDifficulty(raw.difficulty),
  };
}

export function normalizeMcqTest(raw: Record<string, unknown>, skillName: string): GeneratedMcqTest {
  const questionsRaw = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = questionsRaw
    .map((q, i) => normalizeQuestion(q as Record<string, unknown>, i))
    .filter((q): q is McqQuestionFull => q !== null);

  if (questions.length < 10) {
    throw new Error(`Expected 10 MCQ questions, received ${questions.length}`);
  }

  return {
    title: String(raw.title ?? `${skillName} MCQ Assessment`),
    type: "MCQ",
    durationMinutes: Number(raw.durationMinutes ?? 15),
    questions: questions.slice(0, 10),
  };
}

export async function generateMcqFromEvidence(params: {
  skillName: string;
  skillDomain: string;
  classification: ClassificationResult;
  evidenceFiles: EvidenceFile[];
  evidenceLanguages: Record<string, number>;
  repo: string | null;
  taskModel: string;
  variationSeed: string;
  lmsSnippets?: string[];
}): Promise<GeneratedMcqTest> {
  const languageLabel = params.classification.language || params.skillName;
  const evidenceBlock = formatEvidenceForPrompt(params.evidenceFiles, params.evidenceLanguages);
  const lmsBlock = params.lmsSnippets?.length
    ? `LMS/Moodle evidence:\n${params.lmsSnippets.slice(0, 5).join("\n")}`
    : "No LMS/Moodle evidence found";

  const prompt = `You are generating a secure MCQ competency test for SIJIL.

Unique generation seed: ${params.variationSeed}

Declared competency: ${params.skillName} (${params.skillDomain})
Primary GitHub repo: ${params.repo ?? "none"}
GitHub evidence files analyzed: ${params.evidenceFiles.length}

Evidence classification:
- language: ${params.classification.language}
- frameworks: ${(params.classification.frameworks ?? []).join(", ") || "none"}
- patterns_observed: ${(params.classification.patterns_observed ?? []).join(", ") || "none"}
- complexity_level: ${params.classification.complexity_level}
- evidence_quality: ${params.classification.evidence_quality}
- reason: ${params.classification.reason}

${lmsBlock}

${evidenceBlock}

Generate exactly 10 multiple-choice questions for "${params.skillName}".
Difficulty mix REQUIRED:
- 4 easy
- 4 medium
- 2 hard

Each question must have exactly 4 options with ids A, B, C, D.
Questions must reflect the declared competency, classification signals, and GitHub code evidence when available.

Return strict JSON only:
{
  "title": "${languageLabel} Evidence-Based MCQ Test",
  "type": "MCQ",
  "durationMinutes": 15,
  "questions": [
    {
      "id": "q1",
      "question": "Question text here",
      "options": [
        { "id": "A", "text": "Option A" },
        { "id": "B", "text": "Option B" },
        { "id": "C", "text": "Option C" },
        { "id": "D", "text": "Option D" }
      ],
      "correctOptionId": "A",
      "explanation": "Short explanation",
      "difficulty": "easy"
    }
  ]
}`;

  const raw = await llmJson<Record<string, unknown>>({
    purpose: "task",
    prompt,
    schema: MCQ_GENERATION_SCHEMA,
    geminiModel: params.taskModel,
    temperature: 0.85,
  });

  const test = normalizeMcqTest(raw, params.skillName);
  test.durationMinutes = test.durationMinutes || 15;
  return test;
}

export async function generateMcqTask(params: {
  skillName: string;
  skillDomain: string;
  classification: ClassificationResult;
  evidenceFiles: EvidenceFile[];
  evidenceLanguages: Record<string, number>;
  repo: string | null;
  taskModel: string;
  variationSeed: string;
  lmsSnippets?: string[];
}): Promise<{ test: GeneratedMcqTest; fallback: boolean }> {
  if (!hasAiProviderConfigured()) {
    const test = buildLocalFallbackMcqTest(params.skillName);
    test.durationMinutes = 15;
    return { test, fallback: true };
  }

  try {
    const test = await generateMcqFromEvidence(params);
    return { test, fallback: false };
  } catch (err) {
    console.error("AI MCQ generation failed:", err);
    if (isRecoverableAIError(err)) {
      const test = buildLocalFallbackMcqTest(params.skillName);
      test.durationMinutes = 15;
      return { test, fallback: true };
    }
    throw err;
  }
}

function template(
  id: string,
  question: string,
  options: [string, string, string, string],
  correct: McqOptionId,
  difficulty: McqDifficulty,
  explanation: string,
): McqQuestionFull {
  const ids: McqOptionId[] = ["A", "B", "C", "D"];
  return {
    id,
    question,
    options: ids.map((optId, i) => ({ id: optId, text: options[i] })),
    correctOptionId: correct,
    explanation,
    difficulty,
  };
}

export function buildLocalFallbackMcqTest(skillName: string): GeneratedMcqTest {
  const skill = skillName.toLowerCase();
  const isTypeScript = skill.includes("typescript") || skill.includes("ts");

  const questions: McqQuestionFull[] = isTypeScript
    ? [
      template("q1", "What is the primary purpose of a TypeScript interface?", ["Runtime validation", "Describing object shapes at compile time", "Creating DOM elements", "Managing HTTP requests"], "B", "easy", "Interfaces describe shapes for compile-time checking."),
      template("q2", "Which syntax marks an optional property?", ["property!", "property?", "optional property", "property*"], "B", "easy", "? marks optional properties."),
      template("q3", "What does a function return type annotation specify?", ["The parameter names", "The type of value the function returns", "The module path", "The package version"], "B", "easy", "Return types annotate outputs."),
      template("q4", "How are typed arrays declared?", ["array<string>", "string[]", "Array(string)", "string array"], "B", "easy", "string[] is common array syntax."),
      template("q5", "What does strict type checking help prevent?", ["Syntax highlighting", "Type-related bugs before runtime", "Git merge conflicts", "Network latency"], "B", "medium", "Static typing catches many errors early."),
      template("q6", "What is null vs undefined in TypeScript?", ["They are identical always", "null is an assigned absence; undefined often means not initialized", "undefined is only for numbers", "null is only for strings"], "B", "medium", "Both represent absence differently."),
      template("q7", "Why use generics like Array<T>?", ["To disable type checking", "To write reusable code while preserving types", "To remove interfaces", "To bypass compilation"], "B", "medium", "Generics preserve type information."),
      template("q8", "What happens when you assign a string to a number variable under strict mode?", ["It silently succeeds", "TypeScript reports a compile-time error", "It converts automatically at runtime only", "It creates a new interface"], "B", "medium", "Strict mode rejects incompatible assignments."),
      template("q9", "Which pattern best models a discriminated union?", ["Shared literal type field on variants", "Only using any", "Deleting all interfaces", "Using only enums for everything"], "A", "hard", "Discriminated unions use a shared tag field."),
      template("q10", "Why prefer unknown over any for external input?", ["unknown disables all checks permanently", "unknown requires narrowing before use, preserving safety", "any is faster at runtime", "unknown removes interfaces"], "B", "hard", "unknown forces safe narrowing."),
    ]
    : [
      template("q1", `What best describes ${skillName}?`, ["An unrelated hobby", "A declared competency being validated", "A database engine only", "A UI theme"], "B", "easy", "Competency validation context."),
      template("q2", `When applying ${skillName}, what matters most?`, ["Ignoring requirements", "Using appropriate concepts for the problem", "Avoiding tests", "Skipping documentation always"], "B", "easy", "Applied competency focus."),
      template("q3", `Which is a sign of ${skillName} understanding?`, ["Random guessing", "Explaining core concepts clearly", "Refusing feedback", "Avoiding practice"], "B", "easy", "Conceptual understanding."),
      template("q4", `Why link GitHub/Moodle evidence to ${skillName}?`, ["To hide activity", "To support competency verification with real work", "To skip assessment", "To replace institution records"], "B", "easy", "Evidence supports verification."),
      template("q5", `Which approach shows ${skillName} best practices?`, ["Copy unrelated code", "Choose solutions aligned with the skill", "Ignore edge cases", "Disable validation"], "B", "medium", "Best practices alignment."),
      template("q6", `How should invalid input be handled in ${skillName} tasks?`, ["Silently ignore it", "Validate and handle edge cases appropriately", "Crash always", "Log only without handling"], "B", "medium", "Input validation."),
      template("q7", `What role does testing play in ${skillName}?`, ["No role", "Confirms behavior and prevents regressions", "Only for documentation", "Only for UI styling"], "B", "medium", "Testing confirms behavior."),
      template("q8", `Which artifact best demonstrates ${skillName}?`, ["Empty file", "Working implementation tied to the skill", "Unrelated screenshot", "Random notes"], "B", "medium", "Working artifacts demonstrate skill."),
      template("q9", `What is a common pitfall in ${skillName}?`, ["Following best practices", "Misapplying patterns without understanding context", "Reading documentation", "Peer review"], "B", "hard", "Misapplication is a common pitfall."),
      template("q10", `How does ${skillName} relate to career credentials here?`, ["It is ignored", "It is validated through evidence and assessment", "It bypasses institution review", "It removes peer review"], "B", "hard", "Validated through SIJIL pipeline."),
    ];

  return {
    title: `${skillName} MCQ Assessment`,
    type: "MCQ",
    durationMinutes: 15,
    questions,
  };
}

export function evaluateMcqAnswers(
  answerKeyRaw: unknown,
  learnerAnswers: Record<string, string>,
): { passed: boolean; correctCount: number; total: number; percentage: number; feedback: string } {
  const answerKey = normalizeAnswerKey(answerKeyRaw);
  const { correctCount, totalQuestions, percentage, passed } = scoreMcqSubmission(answerKeyRaw, learnerAnswers);
  const total = totalQuestions || Object.keys(answerKey).length;
  const feedback = "MCQ test submitted and saved.";

  return { passed, correctCount, total, percentage, feedback };
}

export function parseMcqGenerateBody(body: Record<string, unknown>) {
  const parsed = parseGenerateRequest(body);
  const skillId = typeof body.skill === "object" && body.skill !== null && "id" in body.skill
    ? String((body.skill as { id?: unknown }).id ?? "")
    : typeof body.skillId === "string"
      ? body.skillId
      : undefined;

  return {
    ...parsed,
    skillId,
    skill: {
      id: skillId,
      name: parsed.skill.name,
      domain: parsed.skill.domain,
    },
  };
}

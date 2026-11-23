import {
  formatEvidenceForPrompt,
  hasAiProviderConfigured,
  isRecoverableAIError,
  llmJson,
  parseGenerateRequest,
  type ClassificationResult,
  type EvidenceFile,
} from "./github-task-pipeline.ts";
import { scoreClosedAssessment } from "../../../src/lib/assessment-scoring.ts";

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

export const EXAM_DURATION_MINUTES = 18;

export const MCQ_CONCEPT_COUNT = 10;
export const MCQ_CODE_COUNT = 4;
export const MCQ_CONCEPT_SECONDS = 30;
export const MCQ_CODE_SECONDS = 30;

export type McqOption = {
  id: McqOptionId;
  text: string;
};

export type ExamItem = { id: string; text: string };

export type McqQuestionFull = {
  id: string;
  question: string;
  options: McqOption[];
  correctOptionId: McqOptionId;
  explanation: string;
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
  correctOptionIds?: McqOptionId[];
  correctOrder?: string[];
  correctMatches?: Record<string, string>;
  selectionNote?: string;
};

export type McqQuestionSafe = {
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

export type GeneratedMcqTest = {
  title: string;
  type: "MCQ";
  durationMinutes: number;
  questions: McqQuestionFull[];
};

const MCQ_PASS_THRESHOLD = 0.6;
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
          kind: { type: "string" },
          code: { type: "string" },
          language: { type: "string" },
          seconds: { type: "number" },
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
    kind: question.kind,
    seconds: question.seconds,
    type: question.type,
    ...(question.code ? { code: question.code } : {}),
    ...(question.language ? { language: question.language } : {}),
    ...(question.scenario ? { scenario: question.scenario } : {}),
    ...(question.caseId ? { caseId: question.caseId } : {}),
    ...(question.caseTitle ? { caseTitle: question.caseTitle } : {}),
    ...(question.orderItems ? { orderItems: question.orderItems } : {}),
    ...(question.matchLeft ? { matchLeft: question.matchLeft } : {}),
    ...(question.matchRight ? { matchRight: question.matchRight } : {}),
    ...(question.selectionNote ? { selectionNote: question.selectionNote } : {}),
  };
}

export type McqAnswerKeyEntry = {
  id: string;
  correctOptionId: McqOptionId;
  explanation: string;
  type?: ClosedQuestionType;
  correctOptionIds?: McqOptionId[];
  correctOrder?: string[];
  correctMatches?: Record<string, string>;
};

function readCorrectOptionId(row: Record<string, unknown>): McqOptionId | null {
  return normalizeOptionId(
    row.correctOptionId
      ?? row.correct_option_id
      ?? row.correctAnswer
      ?? row.correct_answer
      ?? row.correctOption
      ?? row.answer
      ?? row.correct_index
      ?? row.correctIndex,
  );
}

function readQuestionId(row: Record<string, unknown>, index: number): string {
  return String(row.id ?? row.question_id ?? row.questionId ?? `q${index + 1}`).trim();
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

export function scoreMcqSubmission(
  answerKeyRaw: unknown,
  answers: Record<string, unknown>,
): {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
} {
  return scoreClosedAssessment(answerKeyRaw, answers);
}

export function buildAnswerKeyEntries(questions: McqQuestionFull[]): McqAnswerKeyEntry[] {
  return questions.map((q) => ({
    id: q.id,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    type: q.type,
    ...(q.correctOptionIds ? { correctOptionIds: q.correctOptionIds } : {}),
    ...(q.correctOrder ? { correctOrder: q.correctOrder } : {}),
    ...(q.correctMatches ? { correctMatches: q.correctMatches } : {}),
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
      const id = String(row.id ?? "");
      const correct = normalizeOptionId(row.correctOptionId);
      if (id && correct) key[id] = correct;
    }
    return key;
  }

  if (raw && typeof raw === "object") {
    const key: Record<string, McqOptionId> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const correct = normalizeOptionId(value);
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

  const code = String(raw.code ?? raw.snippet ?? "").trim();
  const kind: McqQuestionKind = String(raw.kind ?? raw.format ?? "").toLowerCase() === "code" || code
    ? "code"
    : "concept";

  return {
    id: String(raw.id ?? `q${index + 1}`),
    question,
    options: options.slice(0, 4),
    correctOptionId,
    explanation: String(raw.explanation ?? "No explanation provided."),
    difficulty: kind === "code" ? "hard" : normalizeDifficulty(raw.difficulty),
    kind,
    type: kind === "code" ? "debug" : "single",
    seconds: kind === "code" ? MCQ_CODE_SECONDS : MCQ_CONCEPT_SECONDS,
    ...(code ? { code } : {}),
    ...(String(raw.language ?? "").trim() ? { language: String(raw.language).trim() } : {}),
  };
}

function durationMinutesFor(questions: McqQuestionFull[]): number {
  const seconds = questions.reduce((total, question) => total + question.seconds, 0);
  return Math.max(1, Math.ceil(seconds / 60));
}

function stampQuestion(question: McqQuestionFull, kind: McqQuestionKind): McqQuestionFull {
  return {
    ...question,
    kind,
    difficulty: kind === "code" ? "hard" : question.difficulty,
    seconds: kind === "code" ? MCQ_CODE_SECONDS : MCQ_CONCEPT_SECONDS,
    ...(kind === "code" ? { code: question.code, language: question.language || "text" } : {}),
  };
}

function fillCodeChallenges(skillName: string, generated: McqQuestionFull[]): McqQuestionFull[] {
  const local = buildCodeChallenges(skillName);
  const merged: McqQuestionFull[] = [];
  const seen = new Set<string>();
  for (const question of [...generated, ...local]) {
    const code = question.code?.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    merged.push(stampQuestion({ ...question, id: `code-${merged.length + 1}` }, "code"));
    if (merged.length === MCQ_CODE_COUNT) break;
  }
  return merged;
}

export function normalizeMcqTest(raw: Record<string, unknown>, skillName: string): GeneratedMcqTest {
  const questionsRaw = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = questionsRaw
    .map((q, i) => normalizeQuestion(q as Record<string, unknown>, i))
    .filter((q): q is McqQuestionFull => q !== null);

  return {
    title: String(raw.title ?? `${skillName} Practical Assessment`),
    type: "MCQ",
    durationMinutes: EXAM_DURATION_MINUTES,
    questions: assembleProfessionalExam(skillName, questions),
  };
}

export async function generateMcqFromEvidence(params: {
  skillName: string;
  classification: ClassificationResult;
  evidenceFiles: EvidenceFile[];
  evidenceLanguages: Record<string, number>;
  repo: string | null;
  taskModel: string;
  variationSeed: string;
  platformEvidence?: string;
}): Promise<GeneratedMcqTest> {
  const languageLabel = params.classification.language || params.skillName;
  const evidenceBlock = formatEvidenceForPrompt(params.evidenceFiles, params.evidenceLanguages);
  const platformBlock = params.platformEvidence?.trim()
    || "No platform evidence fetched for this competency name.";

  const prompt = `You are generating a secure MCQ competency test for SIJIL.

Unique generation seed: ${params.variationSeed}

PRIMARY TARGET: the declared competency NAME "${params.skillName}".
Do NOT use a domain, category, or unrelated topic as the test subject.
Generate questions from this competency name and from the learner's fetched platform data below.

Primary GitHub repo used for source snippets: ${params.repo ?? "none"}
GitHub evidence files analyzed: ${params.evidenceFiles.length}

Evidence classification from platform data:
- language: ${params.classification.language}
- frameworks: ${(params.classification.frameworks ?? []).join(", ") || "none"}
- patterns_observed: ${(params.classification.patterns_observed ?? []).join(", ") || "none"}
- complexity_level: ${params.classification.complexity_level}
- evidence_quality: ${params.classification.evidence_quality}
- reason: ${params.classification.reason}

Platform evidence fetched for "${params.skillName}":
${platformBlock}

${evidenceBlock}

Generate exactly 14 multiple-choice questions about "${params.skillName}".

First 10 questions, kind "concept":
- 4 easy, 4 medium, 2 hard
- practical knowledge, no code block required

Last 4 questions, kind "code", difficulty "hard":
- each is a short buggy snippet (6 to 14 lines) in the language that best matches "${params.skillName}"
- put the snippet only in the "code" field, with real line breaks
- set "language" to the snippet language
- the question asks the learner to find the bug
- exactly one option correctly names the bug
- do not reveal the fix in the question text
- ground snippets in the learner's frameworks or repos when evidence exists

Each question must have exactly 4 options with ids A, B, C, D.
Rules:
- Every question must be about "${params.skillName}".
- When GitHub, LMS, Moodle, LinkedIn, or uploaded evidence is present, ground questions in that real work.
- If platform evidence is missing, still test applied knowledge of "${params.skillName}" itself.
- Do not ask generic domain-category questions.

Return strict JSON only:
{
  "title": "${languageLabel} Evidence-Based MCQ Test",
  "type": "MCQ",
  "durationMinutes": 9,
  "questions": [
    {
      "id": "q1",
      "kind": "concept",
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
    },
    {
      "id": "q11",
      "kind": "code",
      "language": "${languageLabel}",
      "code": "function example() {\\n  return 1;\\n}",
      "question": "Which bug does this snippet contain?",
      "options": [
        { "id": "A", "text": "Option A" },
        { "id": "B", "text": "Option B" },
        { "id": "C", "text": "Option C" },
        { "id": "D", "text": "Option D" }
      ],
      "correctOptionId": "B",
      "explanation": "Short explanation",
      "difficulty": "hard"
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
  classification: ClassificationResult;
  evidenceFiles: EvidenceFile[];
  evidenceLanguages: Record<string, number>;
  repo: string | null;
  taskModel: string;
  variationSeed: string;
  platformEvidence?: string;
}): Promise<{ test: GeneratedMcqTest; fallback: boolean }> {
  if (!hasAiProviderConfigured()) {
    const test = buildLocalFallbackMcqTest(params.skillName);
    return { test, fallback: true };
  }

  try {
    const test = await generateMcqFromEvidence(params);
    return { test, fallback: false };
  } catch (err) {
    console.error("AI MCQ generation failed:", err);
    if (isRecoverableAIError(err)) {
      const test = buildLocalFallbackMcqTest(params.skillName);
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
    kind: "concept",
    type: "single",
    seconds: MCQ_CONCEPT_SECONDS,
  };
}

function codeTemplate(
  id: string,
  language: string,
  code: string,
  question: string,
  options: [string, string, string, string],
  correct: McqOptionId,
  explanation: string,
): McqQuestionFull {
  return {
    ...template(id, question, options, correct, "hard", explanation),
    kind: "code",
    type: "debug",
    seconds: MCQ_CODE_SECONDS,
    code,
    language,
  };
}

function skillFamily(skillName: string): "react" | "python" | "sql" | "java" | "javascript" {
  const skill = skillName.toLowerCase();
  if (/(react|next\.?js|jsx|frontend)/.test(skill)) return "react";
  if (/(python|django|flask|pandas|numpy)/.test(skill)) return "python";
  if (/(sql|postgres|mysql|database)/.test(skill)) return "sql";
  if (/(java|spring|kotlin)/.test(skill)) return "java";
  return "javascript";
}

export function buildCodeChallenges(skillName: string): McqQuestionFull[] {
  const family = skillFamily(skillName);
  if (family === "python") {
    return [
      codeTemplate("code-1", "python", "def add_entry(entry, log=[]):\n    log.append(entry)\n    return log", `This ${skillName} helper stores entries. Which bug does it contain?`, ["It returns None", "The default list is shared across calls", "append is not a list method", "entry is not hashed"], "B", "A mutable default argument is reused between calls."),
      codeTemplate("code-2", "python", "def classify_age(age):\n    if age > 0 and age < 18 or age > 120:\n        return \"invalid\"\n    return \"ok\"", `Which bug is in this ${skillName} check?`, ["or is evaluated before and, so 0 is accepted", "and binds tighter than or, so non-positive ages are accepted", "return is indented too far", "Strings cannot be returned"], "B", "and has higher precedence, so the lower bound does not apply to the or branch."),
      codeTemplate("code-3", "python", "def best_score(scores):\n    best = 0\n    for score in scores:\n        if score > best:\n            best = score\n    return best", `What fails in this ${skillName} scorer?`, ["The loop never runs", "Negative scores can never become best, so 0 is returned", "score is a string", "best is overwritten every time"], "B", "The sentinel 0 hides an all-negative list."),
      codeTemplate("code-4", "python", "def scale_prices(prices, percent):\n    return [price - price * percent for price in prices]", `A caller passes percent=20 expecting a 20% discount. What is wrong?`, ["The list comprehension syntax is invalid", "percent is treated as a multiplier, not a percentage", "price is mutated in place", "The function divides by zero"], "B", "20 is subtracted as 20 times the price instead of 0.20 times the price."),
    ];
  }
  if (family === "sql") {
    return [
      codeTemplate("code-1", "sql", "SELECT user_name, COUNT(*)\nFROM orders\nWHERE status = 'paid'\nGROUP BY status;", `This ${skillName} report fails. Why?`, ["COUNT cannot be used with WHERE", "user_name is selected but not grouped or aggregated", "status cannot appear in GROUP BY", "The semicolon ends the query early"], "B", "Every selected column must be grouped or aggregated."),
      codeTemplate("code-2", "sql", "SELECT id, email\nFROM users\nWHERE email = NULL;", `Why does this ${skillName} filter miss null emails?`, ["NULL must be compared with IS NULL", "email cannot be selected", "The table name is reserved", "id must be quoted"], "A", "Equality never matches NULL."),
      codeTemplate("code-3", "sql", "SELECT price * quantity AS total\nFROM line_items\nWHERE total > 100;", `Which bug stops this ${skillName} query?`, ["Multiplication is not allowed", "The SELECT alias cannot be used in WHERE", "line_items needs a schema prefix", "price must be cast to text"], "B", "WHERE is evaluated before SELECT aliases."),
      codeTemplate("code-4", "sql", "UPDATE accounts\nSET balance = balance - 50\nWHERE owner_name = 'Ayesha';\n\nUPDATE accounts\nSET balance = balance + 50;", `The second statement was meant to credit one account. What is wrong?`, ["UPDATE cannot change balance", "The second UPDATE has no WHERE, so every account is credited", "Subtraction is invalid SQL", "owner_name must be an integer"], "B", "A missing WHERE updates the whole table."),
    ];
  }
  if (family === "java") {
    return [
      codeTemplate("code-1", "java", "String status = new String(\"ready\");\nif (status == \"ready\") {\n    open();\n}", `Which bug is in this ${skillName} check?`, ["new String is illegal", "== compares references, not text", "if requires braces on one line", "open must be static"], "B", "Use equals for string values."),
      codeTemplate("code-2", "java", "int total = 0;\nfor (int i = 0; i <= items.length; i++) {\n    total += items[i];\n}", `What crashes this ${skillName} loop?`, ["int cannot hold a sum", "The loop uses <= and reads past the last index", "items.length includes nulls", "total must be a long"], "B", "The last legal index is length - 1."),
      codeTemplate("code-3", "java", "public int discount(int price, int percent) {\n    return price - price * percent;\n}", `percent is 20 for a 20% discount. What is wrong?`, ["The method must return void", "percent is applied as a raw multiplier", "price cannot be multiplied", "public methods cannot return int"], "B", "20 should be scaled to 0.20 before multiplying."),
      codeTemplate("code-4", "java", "List<String> names = new ArrayList<>();\nnames.add(\"Ayesha\");\nnames.add(\"Sara\");\nfor (String name : names) {\n    if (name.startsWith(\"S\")) names.remove(name);\n}", `Why is this ${skillName} cleanup unsafe?`, ["startsWith does not exist", "The list is modified while it is being iterated", "ArrayList cannot store strings", "remove only works on arrays"], "B", "Removing during a for-each can throw ConcurrentModificationException."),
    ];
  }
  if (family === "react") {
    return [
      codeTemplate("code-1", "jsx", "function Counter() {\n  const [count, setCount] = useState(0);\n  function increment() {\n    setCount(count + 1);\n    setCount(count + 1);\n  }\n  return <button onClick={increment}>{count}</button>;\n}", `The button should add 2. Which bug does this ${skillName} component have?`, ["useState cannot store numbers", "Both updates read the same count, so it only increases by 1", "onClick must be a string", "The button cannot render count"], "B", "State updates from the same render share the stale count."),
      codeTemplate("code-2", "jsx", "function Price({ cents }) {\n  return <p>{cents.toFixed(2)}</p>;\n}\n\n<Price cents=\"2500\" />", `What goes wrong in this ${skillName} price?`, ["toFixed does not exist on numbers", "cents is a string, so toFixed throws", "p cannot contain text", "2500 is too large for JavaScript"], "B", "String values do not have toFixed."),
      codeTemplate("code-3", "jsx", "useEffect(() => {\n  setReady(true);\n});", `This ${skillName} effect misbehaves. Why?`, ["useEffect cannot call setState", "There is no dependency array, so the effect runs after every render", "true is not a valid state value", "The arrow function is illegal"], "B", "Missing dependencies make the effect run on every commit."),
      codeTemplate("code-4", "jsx", "function List({ items }) {\n  return items.map((item) => <li>{item.name}</li>);\n}", `What is missing from this ${skillName} list?`, ["map cannot return elements", "Each item needs a stable key", "li is not valid in React", "item.name must be a number"], "B", "Lists need keys so React can track identity."),
    ];
  }
  return [
    codeTemplate("code-1", "javascript", "function average(nums) {\n  let total = 0;\n  for (let i = 0; i <= nums.length; i++) {\n    total += nums[i];\n  }\n  return total / nums.length;\n}", `This ${skillName} helper should average a list. Which bug does it contain?`, ["Division happens before the loop", "The loop uses <= and reads one past the last index", "total is declared with const", "The function name is reserved"], "B", "The last valid index is length - 1, so nums[length] is undefined."),
    codeTemplate("code-2", "javascript", "function isAdult(age) {\n  if (age = 18) return true;\n  return age > 18;\n}", `Which bug is in this ${skillName} check?`, ["18 is not a number", "The condition assigns 18 instead of comparing it", "return cannot be used twice", "age must be a string"], "B", "A single = assigns and the assigned value is truthy."),
    codeTemplate("code-3", "javascript", "function sum(values) {\n  let total = 0;\n  for (const value of values) {\n    total = value;\n  }\n  return total;\n}", `What does this ${skillName} sum actually return?`, ["The count of values", "Only the last value, because total is replaced", "The product of the values", "undefined, because for...of cannot read arrays"], "B", "The accumulator is overwritten instead of increased."),
    codeTemplate("code-4", "javascript", "function discount(price, percent) {\n  return price - price * percent;\n}", `Callers pass percent as 20 for 20% off. What is wrong?`, ["Subtraction is not allowed", "percent is used as a multiplier instead of a fraction of 100", "price is mutated", "The function always returns 0"], "B", "20 should be converted to 0.2 before it scales the price."),
  ];
}

function examQuestion(question: McqQuestionFull): McqQuestionFull {
  return question;
}

function assembleProfessionalExam(skillName: string, generated: McqQuestionFull[]): McqQuestionFull[] {
  const exam = buildProfessionalExam(skillName);
  const aiSingles = generated.filter((question) =>
    question.type === "single" && question.question.trim() && question.options.length >= 4
  );
  let used = 0;
  return exam.map((question) => {
    if (question.type !== "single" || used >= 2 || used >= aiSingles.length) return question;
    const ai = aiSingles[used];
    used += 1;
    return {
      ...question,
      question: ai.question,
      options: ai.options.slice(0, 4),
      correctOptionId: ai.correctOptionId,
      explanation: ai.explanation,
      difficulty: ai.difficulty,
    };
  });
}

export function buildProfessionalExam(skillName: string): McqQuestionFull[] {
  const caseText = `A team maintains a ${skillName} service for customer records. Only the record owner may read or change a record. A failed write must not leave a partial record. Repeating the same request must not create a second record. The build writes the record before it checks authorization, and it does not store an idempotency key.`;
  const ids = ["A", "B", "C", "D"] as const;
  const options = (texts: [string, string, string, string]) =>
    ids.map((id, index) => ({ id, text: texts[index] }));

  return [
    examQuestion({
      id: "single-1",
      type: "single",
      kind: "concept",
      difficulty: "easy",
      seconds: 30,
      question: `A ${skillName} change works on one machine and fails for everyone else. What should be compared first?`,
      options: options([
        "The desktop wallpaper",
        "The font used in the README",
        "The input, environment, and version that differ from the failing run",
        "The color of the status page",
      ]),
      correctOptionId: "C",
      explanation: "A local-only success usually means the failing environment differs in input, configuration, or version.",
    }),
    examQuestion({
      id: "single-2",
      type: "single",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      question: `Which outcome is the strongest evidence of practical ${skillName} competence?`,
      options: options([
        "A working result whose behavior can be explained and checked",
        "A list of tool names with no outcome",
        "An unrelated screenshot",
        "A copied definition with no application",
      ]),
      correctOptionId: "A",
      explanation: "Competence is shown by a checkable result, not by naming tools.",
    }),
    examQuestion({
      id: "scenario-1",
      type: "scenario",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      scenario: `A ${skillName} feature is released. The common path succeeds. The same action fails only when the input is empty. The test log covers the successful path and no empty input.`,
      question: "What should be investigated first?",
      options: options([
        "The page background color",
        "The empty-input path and the missing test for it",
        "Replacing the entire database before reading the error",
        "Turning off logs",
      ]),
      correctOptionId: "B",
      explanation: "The failure is isolated to an untested input, so that path comes first.",
    }),
    examQuestion({
      id: "case-1",
      type: "case",
      kind: "concept",
      difficulty: "hard",
      seconds: 30,
      caseId: "release-case",
      caseTitle: "Customer record service",
      scenario: caseText,
      question: "Writing the record before the authorization check breaks which requirement?",
      options: options([
        "Desktop layout",
        "Only the owner may read or change a record",
        "The service must use a blue header",
        "Logs must be written in uppercase",
      ]),
      correctOptionId: "B",
      explanation: "An unauthorized caller can cause a write before access is refused.",
    }),
    examQuestion({
      id: "case-2",
      type: "case",
      kind: "concept",
      difficulty: "hard",
      seconds: 30,
      caseId: "release-case",
      caseTitle: "Customer record service",
      scenario: caseText,
      question: "Which change stops a repeated request from creating a second record?",
      options: options([
        "Store the idempotency key and return the original result when it repeats",
        "Remove the authorization check",
        "Create a new record for every retry",
        "Hide the error from the caller",
      ]),
      correctOptionId: "A",
      explanation: "An idempotency key makes a retry resolve to the first result.",
    }),
    examQuestion({
      id: "multi-1",
      type: "multi",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      selectionNote: "Select all that apply. The item is correct only when the full set matches.",
      question: `Which checks belong before a ${skillName} release?`,
      options: options([
        "Behavior on invalid input",
        "The author's favorite color",
        "What a repeated request does",
        "Printing a production password in the interface",
      ]),
      correctOptionId: "A",
      correctOptionIds: ["A", "C"],
      explanation: "Invalid input and repeated requests are release checks. The other choices are not.",
    }),
    examQuestion({
      id: "bool-1",
      type: "boolean",
      kind: "concept",
      difficulty: "easy",
      seconds: 30,
      question: `A ${skillName} demo that passes on one happy path proves the change is safe for every input.`,
      options: options(["True", "False", "True only on Fridays", "False only for databases"]),
      correctOptionId: "B",
      explanation: "One happy path does not cover empty, invalid, or repeated inputs.",
    }),
    examQuestion({
      id: "output-1",
      type: "code-output",
      kind: "code",
      difficulty: "medium",
      seconds: 30,
      language: "javascript",
      code: "const values = [2, 4, 6];\nlet total = 0;\nfor (const value of values) total += value;\nconsole.log(total);",
      question: "What does this program print?",
      options: options(["2", "12", "6", "undefined"]),
      correctOptionId: "B",
      explanation: "2 + 4 + 6 is 12.",
    }),
    examQuestion({
      id: "debug-1",
      type: "debug",
      kind: "code",
      difficulty: "hard",
      seconds: 30,
      language: "javascript",
      code: "function isReady(status) {\n  if (status = \"ready\") return true;\n  return false;\n}",
      question: `This ${skillName} helper mis-classifies status. Which bug does it contain?`,
      options: options([
        "The word ready is too short",
        "The condition assigns ready instead of comparing it",
        "return is illegal in a function",
        "status must be a number",
      ]),
      correctOptionId: "B",
      explanation: "A single equals sign assigns, and the assigned string is always truthy.",
    }),
    examQuestion({
      id: "order-1",
      type: "order",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      question: `Arrange the safe ${skillName} request handling steps from first to last.`,
      options: [],
      orderItems: [
        { id: "receive", text: "Receive the request" },
        { id: "validate", text: "Validate the input" },
        { id: "authorize", text: "Check that the caller is allowed" },
        { id: "commit", text: "Commit the change" },
      ],
      correctOptionId: "A",
      correctOrder: ["receive", "validate", "authorize", "commit"],
      explanation: "The change is committed only after the input is valid and the caller is allowed.",
    }),
    examQuestion({
      id: "match-1",
      type: "match",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      question: "Match each HTTP status with its meaning.",
      options: [],
      matchLeft: [
        { id: "s401", text: "401" },
        { id: "s404", text: "404" },
        { id: "s409", text: "409" },
        { id: "s200", text: "200" },
      ],
      matchRight: [
        { id: "ok", text: "OK" },
        { id: "missing", text: "Not found" },
        { id: "unauth", text: "Unauthorized" },
        { id: "conflict", text: "Conflict" },
      ],
      correctOptionId: "A",
      correctMatches: { s401: "unauth", s404: "missing", s409: "conflict", s200: "ok" },
      explanation: "401 is unauthorized, 404 is not found, 409 is a conflict, and 200 is OK.",
    }),
    examQuestion({
      id: "hotspot-1",
      type: "hotspot",
      kind: "concept",
      difficulty: "medium",
      seconds: 30,
      question: "A request moves through the regions below. Select the region that must reject a caller who is not the owner.",
      options: options([
        "Public homepage",
        "Authorization check",
        "Static image cache",
        "Analytics beacon",
      ]),
      correctOptionId: "B",
      explanation: "Ownership is enforced at the authorization check, not in the public page or cache.",
    }),
  ];
}

export function buildLocalFallbackMcqTest(skillName: string): GeneratedMcqTest {
  return {
    title: `${skillName} Practical Assessment`,
    type: "MCQ",
    durationMinutes: EXAM_DURATION_MINUTES,
    questions: buildProfessionalExam(skillName),
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

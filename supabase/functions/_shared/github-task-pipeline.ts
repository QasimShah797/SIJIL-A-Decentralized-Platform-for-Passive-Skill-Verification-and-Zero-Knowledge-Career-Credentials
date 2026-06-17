const GH = "https://api.github.com";

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  "coverage",
]);

const MAX_EVIDENCE_FILES = 20;
const MAX_EVIDENCE_CHARS = 60_000;

export type RepoRef = {
  full_name?: string;
  name?: string;
  html_url?: string;
  github_url?: string;
  language?: string | null;
};

export type EvidenceFile = {
  path: string;
  content: string;
  size: number;
};

export type ClassificationResult = {
  language: string;
  frameworks: string[];
  patterns_observed: string[];
  complexity_level: string;
  evidence_quality: string;
  confidence: number;
  reason: string;
};

export type GeneratedTask = {
  title: string;
  skill: string;
  difficulty: string;
  task_type: string;
  scenario: string;
  instructions: string;
  starter_context: string;
  acceptance_criteria: string[];
  hidden_test_ideas: string[];
  evaluation_rubric: Array<{ criterion: string; weight: number; description: string }>;
};

export type EvaluationResult = {
  overall_pass: boolean;
  score: number;
  criteria_results: Array<{ criterion: string; passed?: boolean; met?: boolean; reason?: string; notes?: string }>;
  missing_requirements: string[];
  feedback: string;
  improvement_suggestions: string[];
  evaluationUnavailable?: boolean;
};

export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const slashMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }

  return null;
}

export function resolveRepoSlug(repo: RepoRef): { owner: string; repo: string } | null {
  const fromFullName = repo.full_name ? parseGitHubUrl(repo.full_name) : null;
  if (fromFullName) return fromFullName;

  const url = repo.html_url ?? repo.github_url;
  if (url) {
    const parsed = parseGitHubUrl(url);
    if (parsed) return parsed;
  }

  return null;
}

function skillExtensions(skillName: string): string[] {
  const n = skillName.toLowerCase();
  if (n.includes("react") || n.includes("javascript") || n.includes("typescript") || n.includes("node")) {
    return [".js", ".jsx", ".ts", ".tsx"];
  }
  if (n.includes("python")) return [".py"];
  if (n.includes("java") && !n.includes("javascript")) return [".java"];
  if (n.includes("c++") || n.includes("cpp")) return [".cpp", ".h", ".hpp"];
  if (n.includes("sql") || n.includes("postgres")) return [".sql"];
  return [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".cpp", ".h", ".hpp", ".sql"];
}

function matchesExtension(path: string, extensions: string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

type GhContentItem = {
  type: "file" | "dir" | "symlink" | "submodule";
  path: string;
  name: string;
  download_url?: string | null;
  content?: string;
  encoding?: string;
  size?: number;
};

export async function githubFetch(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sijil-edge-task-generator",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GH}${path}`, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} for ${path}: ${detail.slice(0, 200)}`);
  }
  return res;
}

export async function getRepoLanguages(
  owner: string,
  repo: string,
  token?: string,
): Promise<Record<string, number>> {
  const res = await githubFetch(`/repos/${owner}/${repo}/languages`, token);
  return await res.json();
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string,
): Promise<string> {
  const res = await githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, token);
  const item = (await res.json()) as GhContentItem;

  if (item.content && item.encoding === "base64") {
    const binary = atob(item.content.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  if (item.download_url) {
    const raw = await fetch(item.download_url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!raw.ok) throw new Error(`Failed to download ${path}`);
    return await raw.text();
  }

  return "";
}

export async function collectRepoEvidence(
  owner: string,
  repo: string,
  skillName: string,
  token?: string,
): Promise<{ files: EvidenceFile[]; languages: Record<string, number> }> {
  const extensions = skillExtensions(skillName);
  const languages = await getRepoLanguages(owner, repo, token).catch(() => ({}));

  const files: EvidenceFile[] = [];
  let totalChars = 0;
  const dirQueue: string[] = [""];

  while (dirQueue.length > 0 && files.length < MAX_EVIDENCE_FILES && totalChars < MAX_EVIDENCE_CHARS) {
    const dirPath = dirQueue.shift()!;
    const apiPath = dirPath
      ? `/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}`
      : `/repos/${owner}/${repo}/contents`;

    let items: GhContentItem[];
    try {
      const res = await githubFetch(apiPath, token);
      items = await res.json();
    } catch {
      continue;
    }

    if (!Array.isArray(items)) continue;

    for (const item of items) {
      if (files.length >= MAX_EVIDENCE_FILES || totalChars >= MAX_EVIDENCE_CHARS) break;

      if (item.type === "dir") {
        if (!IGNORED_DIRS.has(item.name)) dirQueue.push(item.path);
        continue;
      }

      if (item.type !== "file" || !matchesExtension(item.path, extensions)) continue;
      if ((item.size ?? 0) > 100_000) continue;

      try {
        const content = await fetchFileContent(owner, repo, item.path, token);
        if (!content.trim()) continue;

        const remaining = MAX_EVIDENCE_CHARS - totalChars;
        const slice = content.length > remaining ? content.slice(0, remaining) : content;
        files.push({ path: item.path, content: slice, size: slice.length });
        totalChars += slice.length;
      } catch {
        // skip unreadable files
      }
    }
  }

  return { files, languages };
}

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string" },
    frameworks: { type: "array", items: { type: "string" } },
    patterns_observed: { type: "array", items: { type: "string" } },
    complexity_level: { type: "string" },
    evidence_quality: { type: "string" },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: [
    "language",
    "frameworks",
    "patterns_observed",
    "complexity_level",
    "evidence_quality",
    "confidence",
    "reason",
  ],
};

const TASK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    skill: { type: "string" },
    difficulty: { type: "string" },
    task_type: { type: "string" },
    scenario: { type: "string" },
    instructions: { type: "string" },
    starter_context: { type: "string" },
    acceptance_criteria: { type: "array", items: { type: "string" } },
    hidden_test_ideas: { type: "array", items: { type: "string" } },
    evaluation_rubric: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          weight: { type: "number" },
          description: { type: "string" },
        },
        required: ["criterion", "weight", "description"],
      },
    },
  },
  required: [
    "title",
    "skill",
    "difficulty",
    "task_type",
    "scenario",
    "instructions",
    "starter_context",
    "acceptance_criteria",
    "hidden_test_ideas",
    "evaluation_rubric",
  ],
};

const EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    overall_pass: { type: "boolean" },
    score: { type: "number" },
    feedback: { type: "string" },
    criteria_results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          passed: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
    missing_requirements: {
      type: "array",
      items: { type: "string" },
    },
    improvement_suggestions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export const evaluationSchema = EVALUATION_SCHEMA;

export async function geminiJson<T>(
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY secret");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    },
  );

  const rawText = await res.text();

  if (!res.ok) {
    console.error("Gemini API error:", {
      status: res.status,
      model,
      rawText,
    });

    throw new Error(`Gemini API error ${res.status}: ${rawText}`);
  }

  let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("Gemini HTTP response was not JSON:", rawText);
    throw new Error("Gemini HTTP response was not JSON");
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join("") || "";

  if (!text) {
    console.error("Gemini returned empty model text:", data);
    throw new Error("Gemini returned empty response text");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("Gemini returned invalid JSON text:", text);
    throw new Error(`Gemini returned invalid JSON text: ${text.slice(0, 500)}`);
  }
}

function formatEvidenceForPrompt(files: EvidenceFile[], languages: Record<string, number>): string {
  if (files.length === 0) {
    return "No source files collected from the repository.";
  }

  const langSummary = Object.keys(languages).length
    ? `Declared repo languages (GitHub): ${Object.entries(languages).map(([k, v]) => `${k} (${v} bytes)`).join(", ")}`
    : "Repo languages: unknown";

  const snippets = files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  return `${langSummary}\n\nSource snippets (${files.length} files):\n${snippets}`;
}

export async function classifyEvidence(
  skill: { name: string; domain?: string },
  evidence: { files: EvidenceFile[]; languages: Record<string, number> },
  apiKey: string,
  model: string,
): Promise<ClassificationResult> {
  const prompt = `You are a technical evidence classifier for a skills verification platform.

Declared skill: "${skill.name}" (domain: "${skill.domain ?? "General"}")
${formatEvidenceForPrompt(evidence.files, evidence.languages)}

Analyze ONLY the evidence above. Return strict JSON with exactly these keys:
{
  "language": "primary language observed",
  "frameworks": ["framework or library names"],
  "patterns_observed": ["concrete coding patterns, e.g. hooks, REST routes, ORM usage"],
  "complexity_level": "beginner|intermediate|advanced",
  "evidence_quality": "low|medium|high",
  "confidence": 0.0,
  "reason": "one paragraph explaining the classification"
}

Rules:
- confidence is a number from 0 to 1
- If evidence is sparse, lower confidence and say so in reason
- Do not invent files or patterns not supported by the snippets`;

  return await geminiJson<ClassificationResult>(model, prompt, CLASSIFICATION_SCHEMA);
}

export async function generateTask(
  skill: { name: string; domain?: string },
  classification: ClassificationResult,
  apiKey: string,
  model: string,
): Promise<GeneratedTask> {
  const prompt = `You are creating a practical 20-minute coding assessment grounded in real learner evidence.

Declared skill: "${skill.name}" (domain: "${skill.domain ?? "General"}")
Evidence classification:
${JSON.stringify(classification, null, 2)}

Generate ONE specific, concrete problem — not a generic "demonstrate your skills" prompt.
The task must align with the declared skill and reflect patterns from the classification when confidence >= 0.4.

Return strict JSON with exactly these keys:
{
  "title": "short problem title",
  "skill": "${skill.name}",
  "difficulty": "beginner|intermediate|advanced",
  "task_type": "Coding|Debugging|Design|Hands-on|MCQ + Short Answer",
  "scenario": "2-3 sentence real-world context",
  "instructions": "clear step-by-step instructions with input/output examples",
  "starter_context": "starter code, function signature, or scaffold the learner should extend",
  "acceptance_criteria": ["measurable requirement 1", "requirement 2"],
  "hidden_test_ideas": ["test case idea not shown to learner"],
  "evaluation_rubric": [
    { "criterion": "correctness", "weight": 40, "description": "..." },
    { "criterion": "skill alignment", "weight": 30, "description": "..." },
    { "criterion": "code quality", "weight": 30, "description": "..." }
  ]
}

Rules:
- Must be solvable in ~20 minutes
- weights in evaluation_rubric must sum to 100
- hidden_test_ideas are for evaluators only`;

  return await geminiJson<GeneratedTask>(model, prompt, TASK_SCHEMA);
}

export async function evaluateSubmission(params: {
  task: Record<string, unknown>;
  submission: string;
  testResults?: unknown;
}): Promise<EvaluationResult> {
  const task = params.task;

  const rubricSource =
    task.evaluation_rubric ||
    task.evaluationRubric ||
    task.rubric;

  const rubric = Array.isArray(rubricSource) && rubricSource.length > 0
    ? rubricSource
    : [
      {
        criterion: "Relevance to the task",
        points: 30,
        pass_condition:
          "The submission directly addresses the task prompt and expected deliverable.",
      },
      {
        criterion: "Completeness",
        points: 30,
        pass_condition:
          "The submission is not empty and includes meaningful implementation or explanation.",
      },
      {
        criterion: "Technical correctness",
        points: 40,
        pass_condition:
          "The solution is technically reasonable for the declared skill and task.",
      },
    ];

  const testResultsText = params.testResults != null
    ? (typeof params.testResults === "string"
      ? params.testResults
      : JSON.stringify(params.testResults))
    : "No automated test results provided.";

  const prompt = `
You are evaluating a learner's practical skill task.

Original task:
${JSON.stringify(task, null, 2)}

Evaluation rubric:
${JSON.stringify(rubric, null, 2)}

Learner submission:
${params.submission}

Automated test results:
${testResultsText}

Rules:
- Evaluate against the original task only.
- Do not change the task.
- If the submission uses the wrong language/framework for the task, mark it as failed and explain why.
- Return JSON only.
- Score must be from 0 to 100.
- overall_pass should be true only if the submission satisfies the task.
`;

  const model =
    Deno.env.get("GEMINI_EVAL_MODEL") ||
    Deno.env.get("GEMINI_TASK_MODEL") ||
    "gemini-2.5-flash";

  return await geminiJson<EvaluationResult>(model, prompt, evaluationSchema);
}

export function pickBestRepo(repos: RepoRef[], skillName: string): RepoRef | null {
  if (!repos?.length) return null;
  const skill = skillName.toLowerCase();

  const scored = repos
    .map((r) => {
      const lang = (r.language ?? "").toLowerCase();
      let score = 0;
      if (lang && (lang.includes(skill) || skill.includes(lang))) score += 3;
      if (skill.includes("react") && (lang.includes("javascript") || lang.includes("typescript"))) score += 2;
      if (skill.includes("node") && lang.includes("javascript")) score += 2;
      if (skill.includes("python") && lang.includes("python")) score += 3;
      if (skill.includes("java") && lang.includes("java")) score += 3;
      if (skill.includes("sql") && (lang.includes("sql") || lang.includes("plpgsql"))) score += 3;
      return { repo: r, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.repo ?? repos[0];
}

export function buildFallbackClassification(skillName: string): ClassificationResult {
  return {
    language: skillName,
    frameworks: [],
    patterns_observed: [`${skillName} practical implementation`],
    complexity_level: "beginner",
    evidence_quality: "weak",
    confidence: 0.5,
    reason: "No GitHub evidence available, generated from declared skill only.",
  };
}

export function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    lower.includes("quota")
  );
}

export type LocalFallbackTask = {
  title: string;
  type: string;
  durationMinutes: number;
  prompt: string;
  scenario: string;
  instructions: string;
  starterCode: string;
  expectedDeliverable: string;
  acceptance_criteria: string[];
  evaluation_rubric: Array<{ criterion: string; points: number; pass_condition: string }>;
  hidden_test_ideas: string[];
};

export function getLocalFallbackTask(skillName: string): LocalFallbackTask {
  const skill = skillName.toLowerCase();

  if (skill.includes("react")) {
    return {
      title: "Build a Controlled Login Form",
      type: "Coding",
      durationMinutes: 20,
      prompt:
        "Create a React LoginForm component using controlled inputs for email and password. Validate that email contains '@' and password has at least 8 characters. Show validation errors below each field. On valid submit, call the provided onSubmit prop with email and password.",
      scenario:
        "A web application needs a reusable login form with client-side validation before sending credentials to the backend.",
      instructions:
        "Use React state for form values and errors. Do not use external form libraries.",
      starterCode:
        "import { useState } from 'react';\n\nexport function LoginForm({ onSubmit }) {\n  // your code here\n}\n",
      expectedDeliverable:
        "A working controlled React login form with validation and submit handling.",
      acceptance_criteria: [
        "Uses controlled inputs for email and password",
        "Validates email format",
        "Validates password length",
        "Shows error messages",
        "Calls onSubmit only when input is valid",
      ],
      evaluation_rubric: [
        {
          criterion: "Controlled inputs",
          points: 30,
          pass_condition: "Email and password values are managed using React state",
        },
        {
          criterion: "Validation",
          points: 40,
          pass_condition: "Email and password validation are correctly implemented",
        },
        {
          criterion: "Submit handling",
          points: 30,
          pass_condition: "onSubmit is called only for valid input",
        },
      ],
      hidden_test_ideas: [
        "Invalid email should show error",
        "Short password should show error",
        "Valid form should call onSubmit",
      ],
    };
  }

  if (skill.includes("typescript")) {
    return {
      title: "Create a Type-Safe User Formatter",
      type: "Coding",
      durationMinutes: 20,
      prompt:
        "Create a TypeScript function formatUserProfile that accepts a User object and returns a formatted string. The User type must include id, name, email, and optional role. If role is missing, use 'Learner'. Validate that name and email are not empty.",
      scenario:
        "A profile page needs a type-safe formatter before displaying user information.",
      instructions:
        "Define proper TypeScript types/interfaces and handle missing optional role safely.",
      starterCode:
        "interface User {\n  id: number;\n  name: string;\n  email: string;\n  role?: string;\n}\n\nfunction formatUserProfile(user: User): string {\n  // your code here\n}\n",
      expectedDeliverable:
        "A type-safe TypeScript formatter with validation and optional field handling.",
      acceptance_criteria: [
        "Defines correct User interface",
        "Handles optional role",
        "Validates empty name/email",
        "Returns formatted string",
      ],
      evaluation_rubric: [
        {
          criterion: "Type safety",
          points: 35,
          pass_condition: "Uses TypeScript interface/type correctly",
        },
        {
          criterion: "Optional role handling",
          points: 30,
          pass_condition: "Uses default role when role is missing",
        },
        {
          criterion: "Validation",
          points: 35,
          pass_condition: "Rejects or handles empty name/email",
        },
      ],
      hidden_test_ideas: [
        "User without role should use Learner",
        "Empty name should be handled",
        "Valid user should return formatted string",
      ],
    };
  }

  if (skill.includes("java") && !skill.includes("javascript")) {
    return {
      title: "Product Code Formatter",
      type: "Coding",
      durationMinutes: 15,
      prompt:
        "Implement the formatProductCode method in the ProductFormatter class. The method should remove all whitespace, convert the code to uppercase, truncate it to 10 characters, and return INVALID_CODE if input is null or empty after trimming.",
      scenario:
        "An inventory system needs product codes standardized before saving them.",
      instructions:
        "Use Java string handling. Handle null, whitespace, uppercase conversion, and truncation.",
      starterCode:
        "public class ProductFormatter {\n  public static String formatProductCode(String rawCode) {\n    // your code here\n    return null;\n  }\n}\n",
      expectedDeliverable:
        "A Java method that formats product codes according to the given rules.",
      acceptance_criteria: [
        "Handles null input",
        "Removes whitespace",
        "Converts to uppercase",
        "Truncates to 10 characters",
        "Returns INVALID_CODE for invalid input",
      ],
      evaluation_rubric: [
        {
          criterion: "Input validation",
          points: 30,
          pass_condition: "Null and empty input are handled correctly",
        },
        {
          criterion: "Formatting logic",
          points: 40,
          pass_condition: "Whitespace removal and uppercase conversion work",
        },
        {
          criterion: "Truncation",
          points: 30,
          pass_condition: "Output is truncated to 10 characters when needed",
        },
      ],
      hidden_test_ideas: [
        "Null input returns INVALID_CODE",
        "Whitespace is removed",
        "Long code is truncated",
      ],
    };
  }

  return {
    title: `Build a ${skillName} Utility Function`,
    type: "Coding",
    durationMinutes: 20,
    prompt:
      `Create a practical ${skillName} utility function that validates input, handles edge cases, and returns a clean formatted result.`,
    scenario:
      `A software system needs a reliable ${skillName} utility for real-world input processing.`,
    instructions:
      "Write clean code, handle invalid input, and include meaningful logic.",
    starterCode: "",
    expectedDeliverable:
      "A working implementation that satisfies the scenario.",
    acceptance_criteria: [
      "Handles valid input",
      "Handles invalid input",
      "Returns expected output",
      "Code is readable",
    ],
    evaluation_rubric: [
      {
        criterion: "Correctness",
        points: 50,
        pass_condition: "Solution satisfies the task requirements",
      },
      {
        criterion: "Edge cases",
        points: 30,
        pass_condition: "Invalid or empty inputs are handled",
      },
      {
        criterion: "Code quality",
        points: 20,
        pass_condition: "Code is clear and readable",
      },
    ],
    hidden_test_ideas: [],
  };
}

export function parseGenerateRequest(body: Record<string, unknown>): {
  skill: { name: string; domain: string };
  repos: RepoRef[];
} {
  const skillRaw = body.skill;
  const skillName =
    (typeof body.declaredSkill === "string" ? body.declaredSkill : undefined) ||
    (typeof skillRaw === "object" && skillRaw !== null && "name" in skillRaw
      ? String((skillRaw as { name: unknown }).name)
      : undefined) ||
    (typeof body.skillName === "string" ? body.skillName : undefined) ||
    (typeof skillRaw === "string" ? skillRaw : undefined) ||
    "JavaScript";

  const skillDomain =
    (typeof skillRaw === "object" && skillRaw !== null && "domain" in skillRaw
      ? String((skillRaw as { domain?: unknown }).domain ?? "")
      : undefined) ||
    (typeof body.domain === "string" ? body.domain : undefined) ||
    "Software Development";

  const repos = (
    body.repos ??
    body.githubRepos ??
    body.repositories ??
    []
  ) as RepoRef[];

  return {
    skill: { name: skillName, domain: skillDomain },
    repos: Array.isArray(repos) ? repos : [],
  };
}

export async function runTaskGenerationPipeline(params: {
  skill: { name: string; domain?: string };
  repos: RepoRef[];
  githubToken?: string;
  classifyModel: string;
  taskModel: string;
}): Promise<{
  generated: GeneratedTask;
  classification: ClassificationResult;
  evidenceMeta: { repo: string | null; fileCount: number };
}> {
  const { skill, repos, githubToken, classifyModel, taskModel } = params;

  let evidence: { files: EvidenceFile[]; languages: Record<string, number> } = {
    files: [],
    languages: {},
  };
  let repoLabel: string | null = null;

  const chosen = pickBestRepo(repos, skill.name);
  const slug = chosen ? resolveRepoSlug(chosen) : null;

  if (slug) {
    try {
      repoLabel = `${slug.owner}/${slug.repo}`;
      evidence = await collectRepoEvidence(slug.owner, slug.repo, skill.name, githubToken);
    } catch (repoErr) {
      console.error("GitHub evidence collection failed, continuing without repo evidence:", repoErr);
    }
  }

  let classification: ClassificationResult;
  try {
    classification = await classifyEvidence(skill, evidence, "", classifyModel);
  } catch (classifyErr) {
    if (isQuotaError(classifyErr)) throw classifyErr;
    console.error("Classification failed, using fallback:", classifyErr);
    classification = buildFallbackClassification(skill.name);
  }

  let generated: GeneratedTask;
  try {
    generated = await generateTask(skill, classification, "", taskModel);
  } catch (genErr) {
    if (isQuotaError(genErr)) throw genErr;
    console.error("generateTask failed, retrying with fallback classification:", genErr);
    classification = buildFallbackClassification(skill.name);
    generated = await generateTask(skill, classification, "", taskModel);
  }

  if (!generated?.title || (!generated.scenario && !generated.instructions)) {
    throw new Error("Gemini returned incomplete task");
  }

  return {
    generated,
    classification,
    evidenceMeta: { repo: repoLabel, fileCount: evidence.files.length },
  };
}

export function toGenerateApiResponse(
  generated: GeneratedTask,
  skillName: string,
  skillDomain: string,
  extras?: {
    classification?: ClassificationResult;
    evidence?: { repo: string | null; fileCount: number };
  },
) {
  const legacy = toLegacyTaskResponse(
    generated,
    extras?.classification ?? buildFallbackClassification(skillName),
    extras?.evidence ?? { repo: null, fileCount: 0 },
  );

  const prompt =
    generated.scenario ||
    generated.instructions ||
    legacy.prompt ||
    "";

  return {
    title: generated.title,
    type: legacy.type,
    durationMinutes: legacy.durationMinutes,
    prompt,
    scenario: generated.scenario || prompt,
    instructions: generated.instructions || prompt,
    starterCode: generated.starter_context || "",
    expectedDeliverable:
      generated.acceptance_criteria?.length
        ? generated.acceptance_criteria.join("\n")
        : "Submit your implementation in the editor.",
    acceptance_criteria: generated.acceptance_criteria ?? [],
    evaluation_rubric: generated.evaluation_rubric ?? [],
    hidden_test_ideas: generated.hidden_test_ideas ?? [],
    skill: skillName,
    domain: skillDomain,
    rawTask: generated,
    classification: extras?.classification,
    evidence: extras?.evidence,
  };
}

export function toLegacyTaskResponse(
  generated: GeneratedTask,
  classification: ClassificationResult,
  evidenceMeta: { repo: string | null; fileCount: number },
) {
  const typeMap: Record<string, GeneratedTask["task_type"]> = {
    coding: "Coding",
    debugging: "Debugging",
    design: "Design",
    "hands-on": "Hands-on",
    "mcq + short answer": "MCQ + Short Answer",
  };
  const normalizedType = typeMap[generated.task_type.toLowerCase()] ?? "Coding";

  const durationByDifficulty: Record<string, number> = {
    beginner: 15,
    intermediate: 20,
    advanced: 25,
  };
  const durationMinutes = durationByDifficulty[generated.difficulty.toLowerCase()] ?? 20;

  return {
    title: generated.title,
    type: normalizedType,
    durationMinutes,
    prompt: [generated.scenario, generated.instructions].filter(Boolean).join("\n\n"),
    starterCode: generated.starter_context || undefined,
    expectedDeliverable: generated.acceptance_criteria.join("\n"),
    scenario: generated.scenario,
    instructions: generated.instructions,
    acceptance_criteria: generated.acceptance_criteria,
    hidden_test_ideas: generated.hidden_test_ideas,
    evaluation_rubric: generated.evaluation_rubric,
    classification,
    evidence: evidenceMeta,
    task: generated,
  };
}

export function toLegacyEvalResponse(result: EvaluationResult) {
  return {
    passed: result.overall_pass,
    score: result.score,
    feedback: result.feedback,
    criteria_results: result.criteria_results,
    missing_requirements: result.missing_requirements,
    improvement_suggestions: result.improvement_suggestions,
  };
}

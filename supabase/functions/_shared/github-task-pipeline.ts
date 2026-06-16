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

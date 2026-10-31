import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactExactValues } from "../utils/exact-value-redaction";
import { buildAtsResume, buildEvidenceLedger } from "../utils/public-credential-map";
import { DEFAULT_DISCLOSURE_PREFERENCES } from "./disclosure-preferences.service";
import { disclosurePreferencesPatchSchema } from "../validators/disclosure-preferences.validator";
import {
  autoIssueWalletReadyCredentials,
  listWalletReadySkills,
  runCompetencyAutomation,
  scanLinkedGitHubRepositories,
  WALLET_READY_SKILLS_ORDER_COLUMN,
  type CompetencyAutomationDeps,
  type WalletReadySkillsDb,
} from "./competency-automation.service";
import { PIPELINE_STAGE } from "../constants/status";
import { readFileSync } from "node:fs";
import path from "node:path";
import { processZkpAutomationBatch } from "./zkp-automation-worker.service";
import { githubEvidenceRef } from "./github-zkp-automation.service";
import { ASSESSMENT_POLICY_THRESHOLD, GITHUB_POLICY_THRESHOLD } from "./zkp-policy";
import type { ZkpPolicyStore } from "./zkp-policy-store";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const SKILL = "223e4567-e89b-42d3-a456-426614174000";

function payload(): Record<string, unknown> {
  return {
    competency: { competencyId: SKILL, name: "TypeScript" },
    evidence: {
      github: {
        repos: [{ full_name: "octo/demo", primary_language: "TypeScript", commit_count: 83 }],
        activities: [
          { activity_type: "commit", commit_hash: "abc", repo_name: "octo/demo" },
          { activity_type: "pull_request", activity_title: "Add parser" },
        ],
      },
      lms: { assignments: [{ assignment_name: "Quiz", course_name: "TS", grade: 47, grade_max: 50, grade_formatted: "47/50" }] },
      completeEvidencePackage: {
        practicalTask: { latestAttempt: { title: "Task", scorePercent: 91, status: "Passed", score: 91 } },
      },
    },
  };
}

const FIELDS = ["github_evidence", "lms_evidence", "practical_task_result"];

describe("exact value disclosure", () => {
  it("defaults both permissions to OFF", () => {
    assert.equal(DEFAULT_DISCLOSURE_PREFERENCES.shareExactAssessmentMarks, false);
    assert.equal(DEFAULT_DISCLOSURE_PREFERENCES.shareExactGithubCommitCount, false);
  });

  it("withholds marks, grades, commit counts and commit rows when OFF", () => {
    const out = redactExactValues(payload(), DEFAULT_DISCLOSURE_PREFERENCES, "2026-10-31T00:00:00.000Z");
    const text = JSON.stringify(out);
    for (const leak of ["83", "91", "47", "grade", "scorePercent", "commit_count", "abc"]) {
      assert.equal(text.includes(leak), false, `leaked ${leak}`);
    }
    assert.match(text, /Add parser/);
    assert.deepEqual(out.exactValueDisclosure, {
      assessmentMarks: "withheld",
      githubCommitCount: "withheld",
      source: "sijil_backend_records",
      asOf: "2026-10-31T00:00:00.000Z",
    });
    const ledger = JSON.stringify(buildEvidenceLedger(out, SKILL, FIELDS));
    assert.equal(/\d+%|commits|Grade \d/.test(ledger), false);
    const resume = JSON.stringify(buildAtsResume(out, "tok", SKILL, FIELDS));
    assert.equal(resume.includes("83 commits"), false);
  });

  it("discloses only the permitted category when ON", () => {
    const marksOnly = redactExactValues(payload(), { ...DEFAULT_DISCLOSURE_PREFERENCES, shareExactAssessmentMarks: true }, "t");
    const marksText = JSON.stringify(marksOnly);
    assert.match(marksText, /"scorePercent":91/);
    assert.match(marksText, /"grade":47/);
    assert.equal(marksText.includes("commit_count"), false);

    const both = redactExactValues(payload(), {
      shareExactAssessmentMarks: true,
      shareExactGithubCommitCount: true,
      updatedAt: null,
    }, "t");
    assert.match(JSON.stringify(both), /"commit_count":83/);
    assert.match(JSON.stringify(buildAtsResume(both, "tok", SKILL, FIELDS)), /83 commits/);
    assert.equal((both.exactValueDisclosure as { githubCommitCount: string }).githubCommitCount, "disclosed");
  });

  it("ignores a client-forged disclosure marker", () => {
    const forged = { ...payload(), exactValueDisclosure: { assessmentMarks: "disclosed" } };
    const out = redactExactValues(forged, DEFAULT_DISCLOSURE_PREFERENCES, "t");
    assert.equal((out.exactValueDisclosure as { assessmentMarks: string }).assessmentMarks, "withheld");
  });

  it("accepts only the two boolean permissions from learners", () => {
    assert.equal(disclosurePreferencesPatchSchema.safeParse({ shareExactAssessmentMarks: true }).success, true);
    for (const body of [
      {},
      { shareExactAssessmentMarks: "yes" },
      { shareExactAssessmentMarks: true, threshold: 10 },
      { shareExactGithubCommitCount: true, commitCount: 500 },
      { shareExactGithubCommitCount: true, outcome: "MEETS_THRESHOLD" },
      { shareExactAssessmentMarks: true, scorePercent: 100 },
    ]) {
      assert.equal(disclosurePreferencesPatchSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });

  it("keeps the backend policy thresholds fixed", () => {
    assert.equal(ASSESSMENT_POLICY_THRESHOLD, 60);
    assert.equal(GITHUB_POLICY_THRESHOLD, 70);
  });
});

function deps(overrides: Partial<CompetencyAutomationDeps> = {}) {
  const calls = { evaluated: [] as string[], issued: [] as string[], linkedQueries: [] as Array<string | undefined> };
  const base: CompetencyAutomationDeps = {
    linkedRepositories: async (_userId, skillId) => {
      calls.linkedQueries.push(skillId);
      return skillId === SKILL ? [{ userId: LEARNER, repo: "octo/demo" }] : [
        { userId: LEARNER, repo: "octo/demo" },
        { userId: LEARNER, repo: "octo/other" },
      ];
    },
    walletReadySkills: async () => [{ userId: LEARNER, skillId: SKILL }],
    evaluateGitHub: async (_userId, repo) => {
      calls.evaluated.push(repo);
    },
    issueCredential: async (_userId, skillId) => {
      calls.issued.push(skillId);
    },
    ...overrides,
  };
  return { deps: base, calls };
}

function store(existingRefs: string[] = []): ZkpPolicyStore {
  return {
    checkAvailability: async () => ({ available: true }),
    getByEvidence: async (_l: string, _t: string, _v: string, ref: string) =>
      (existingRefs.includes(ref) ? ({ evidenceRef: ref } as never) : null),
    listRetryCandidates: async () => [],
    listStaleGitHub: async () => [],
  } as unknown as ZkpPolicyStore;
}

describe("competency automation", () => {
  it("evaluates only repositories linked to the declared competency, then issues", async () => {
    const { deps: d, calls } = deps();
    const result = await runCompetencyAutomation(LEARNER, SKILL, d);
    assert.deepEqual(calls.linkedQueries, [SKILL]);
    assert.deepEqual(calls.evaluated, ["octo/demo"]);
    assert.deepEqual(calls.issued, [SKILL]);
    assert.deepEqual(result, { evaluated: 1, issued: true });
  });

  it("tolerates proof errors and an unmet issuance gate", async () => {
    const { deps: d } = deps({
      evaluateGitHub: async () => { throw new Error("github_oauth_expired"); },
      issueCredential: async () => { throw new Error("Skill is not verified or attested and cannot be issued"); },
    });
    assert.deepEqual(await runCompetencyAutomation(LEARNER, SKILL, d), { evaluated: 0, issued: false });
  });

  it("auto-issues wallet-ready credentials (which enter the anchor outbox as pending)", async () => {
    const { deps: d, calls } = deps();
    assert.equal(await autoIssueWalletReadyCredentials(5, d), 1);
    assert.deepEqual(calls.issued, [SKILL]);
  });

  it("scans linked repositories without an outcome and skips evaluated ones", async () => {
    const { deps: d, calls } = deps();
    const processed = await scanLinkedGitHubRepositories(store([githubEvidenceRef("octo/demo")]), 5, d);
    assert.equal(processed, 1);
    assert.deepEqual(calls.evaluated, ["octo/other"]);
  });

  it("worker tick runs GitHub scan, auto-issuance, then the assessment scan", async () => {
    const order: string[] = [];
    await processZkpAutomationBatch({
      store: store(),
      batchSize: 3,
      handlers: {
        retryGitHub: async () => undefined,
        retryAssessment: async () => undefined,
        scanLinkedGitHub: async () => { order.push("github"); return 1; },
        autoIssueCredentials: async () => { order.push("issue"); return 1; },
        scanNewAssessments: async () => { order.push("assessment"); return 1; },
      },
    });
    assert.deepEqual(order, ["github", "issue", "assessment"]);
  });
});

function mockWalletReadyDb(result: {
  data?: Array<{ id: string; user_id: string }> | null;
  error?: { message?: string; code?: string; hint?: string | null } | null;
}): { db: WalletReadySkillsDb; calls: { table: string; select: string; eq: [string, string]; order: string; limit: number } } {
  const calls = {
    table: "",
    select: "",
    eq: ["", ""] as [string, string],
    order: "",
    limit: -1,
  };
  const db: WalletReadySkillsDb = {
    from(table) {
      calls.table = table;
      return {
        select(columns) {
          calls.select = columns;
          return {
            eq(column, value) {
              calls.eq = [column, value];
              return {
                order(column) {
                  calls.order = column;
                  return {
                    limit(count) {
                      calls.limit = count;
                      return Promise.resolve({
                        data: result.data ?? null,
                        error: result.error ?? null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

describe("walletReadySkills scan (declared_skills ordering)", () => {
  it("orders by created_at and never references updated_at", async () => {
    assert.equal(WALLET_READY_SKILLS_ORDER_COLUMN, "created_at");
    const source = readFileSync(
      path.resolve(__dirname, "competency-automation.service.ts"),
      "utf8",
    );
    assert.equal(source.includes('.order("updated_at"'), false);
    assert.equal(source.includes("order(\"updated_at\""), false);
    assert.match(source, /WALLET_READY_SKILLS_ORDER_COLUMN/);

    const { db, calls } = mockWalletReadyDb({
      data: [{ id: SKILL, user_id: LEARNER }],
    });
    const rows = await listWalletReadySkills(5, db);
    assert.deepEqual(rows, [{ userId: LEARNER, skillId: SKILL }]);
    assert.equal(calls.table, "declared_skills");
    assert.equal(calls.select, "id, user_id");
    assert.deepEqual(calls.eq, ["pipeline_stage", PIPELINE_STAGE.WALLET_READY]);
    assert.equal(calls.order, "created_at");
    assert.equal(calls.order.includes("updated"), false);
    assert.equal(calls.limit, 5);
  });

  it("returns valid wallet-ready skills from a successful scan", async () => {
    const otherSkill = "323e4567-e89b-42d3-a456-426614174000";
    const { db } = mockWalletReadyDb({
      data: [
        { id: SKILL, user_id: LEARNER },
        { id: otherSkill, user_id: "423e4567-e89b-42d3-a456-426614174000" },
        { id: "623e4567-e89b-42d3-a456-426614174000", user_id: null as unknown as string },
      ],
    });
    assert.deepEqual(await listWalletReadySkills(10, db), [
      { userId: LEARNER, skillId: SKILL },
      { userId: "423e4567-e89b-42d3-a456-426614174000", skillId: otherSkill },
    ]);
  });

  it("reports Supabase errors visibly instead of returning an empty success", async () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const { db } = mockWalletReadyDb({
        data: null,
        error: {
          code: "42703",
          message: "column declared_skills.updated_at does not exist",
          hint: "Perhaps you meant to reference the column \"declared_skills.created_at\".",
        },
      });
      await assert.rejects(
        () => listWalletReadySkills(5, db),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /walletReadySkills scan failed/);
          assert.match(err.message, /updated_at does not exist/);
          return true;
        },
      );
      assert.ok(errors.length >= 1);
      const logged = JSON.stringify(errors);
      assert.match(logged, /competency-automation/);
      assert.match(logged, /walletReadySkills query failed/);
      assert.match(logged, /42703/);
    } finally {
      console.error = originalError;
    }
  });

  it("does not call issue when the wallet-ready scan fails", async () => {
    const { deps: d, calls } = deps({
      walletReadySkills: async () => {
        throw new Error("walletReadySkills scan failed: column declared_skills.updated_at does not exist");
      },
    });
    await assert.rejects(
      () => autoIssueWalletReadyCredentials(5, d),
      /walletReadySkills scan failed/,
    );
    assert.deepEqual(calls.issued, []);
  });

  it("keeps per-skill issuance gated and continues after a gate failure", async () => {
    const second = "523e4567-e89b-42d3-a456-426614174000";
    const { deps: d, calls } = deps({
      walletReadySkills: async () => [
        { userId: LEARNER, skillId: SKILL },
        { userId: LEARNER, skillId: second },
      ],
      issueCredential: async (_userId, skillId) => {
        if (skillId === SKILL) {
          throw new Error("Supporting evidence does not meet trust tier requirements");
        }
        calls.issued.push(skillId);
      },
    });
    assert.equal(await autoIssueWalletReadyCredentials(5, d), 1);
    assert.deepEqual(calls.issued, [second]);
  });
});

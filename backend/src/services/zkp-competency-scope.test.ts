import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterRowsToScope, resolveCompetencyScope, type CompetencyScopeDeps } from "./zkp-competency-scope.service";
import { githubEvidenceRef } from "./github-zkp-automation.service";
import { assessmentEvidenceRef } from "./assessment-zkp-automation.service";
import type { ZkpPolicyVerificationRow } from "./zkp-policy-store";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const JAVA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PYTHON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPTY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BOB_SKILL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// Stored associations only: "alice/shared" is explicitly linked to both Java and Python.
const links: Record<string, Record<string, string[]>> = {
  [ALICE]: {
    [JAVA]: ["alice/java-api", "alice/shared"],
    [PYTHON]: ["alice/py-tools", "alice/shared"],
    [EMPTY]: [],
  },
  [BOB]: { [BOB_SKILL]: ["bob/java-api"] },
};

const deps: CompetencyScopeDeps = {
  ownsCompetency: async (userId, competencyId) => Boolean(links[userId]?.[competencyId]),
  linkedRepositories: async (userId, competencyId) => links[userId]?.[competencyId] ?? [],
  assessmentAttemptId: async (userId, competencyId) => (userId === ALICE && competencyId === JAVA ? "attempt-java" : null),
};

function row(learnerUserId: string, zkpType: string, evidenceRef: string, outcome = "MEETS_THRESHOLD"): ZkpPolicyVerificationRow {
  return { learnerUserId, zkpType, evidenceRef, outcome } as unknown as ZkpPolicyVerificationRow;
}

const GH = "github-contributions-v1";
const AS = "score-threshold-v1";

// Alice's full policy history, including an unrelated 120-commit repository and another user's row.
const rows = [
  row(ALICE, GH, githubEvidenceRef("alice/java-api")),
  row(ALICE, GH, githubEvidenceRef("alice/py-tools"), "BELOW_THRESHOLD"),
  row(ALICE, GH, githubEvidenceRef("alice/shared"), "PENDING"),
  row(ALICE, GH, githubEvidenceRef("alice/huge-unrelated")),
  row(ALICE, AS, assessmentEvidenceRef("attempt-java")),
  row(ALICE, AS, assessmentEvidenceRef("attempt-other"), "BELOW_THRESHOLD"),
  row(BOB, GH, githubEvidenceRef("alice/java-api")),
];

async function scoped(userId: string, competencyId: string) {
  return filterRowsToScope(rows, userId, await resolveCompetencyScope(userId, competencyId, deps));
}

const refs = (list: ZkpPolicyVerificationRow[]) => list.map((item) => item.evidenceRef).sort();

describe("competency-scoped policy outcomes", () => {
  it("Java shows only Java-linked repositories and its own assessment", async () => {
    assert.deepEqual(refs(await scoped(ALICE, JAVA)), [
      assessmentEvidenceRef("attempt-java"),
      githubEvidenceRef("alice/java-api"),
      githubEvidenceRef("alice/shared"),
    ].sort());
  });

  it("Python shows only Python-linked repositories, keeping outcome distinctions", async () => {
    const result = await scoped(ALICE, PYTHON);
    assert.deepEqual(refs(result), [githubEvidenceRef("alice/py-tools"), githubEvidenceRef("alice/shared")].sort());
    assert.deepEqual(result.map((item) => item.outcome).sort(), ["BELOW_THRESHOLD", "PENDING"]);
  });

  it("excludes an unrelated repository even when it meets the commit threshold", async () => {
    for (const competency of [JAVA, PYTHON, EMPTY]) {
      assert.equal(refs(await scoped(ALICE, competency)).includes(githubEvidenceRef("alice/huge-unrelated")), false);
    }
  });

  it("shows a shared repository under each explicitly linked competency only", async () => {
    const shared = githubEvidenceRef("alice/shared");
    assert.equal(refs(await scoped(ALICE, JAVA)).includes(shared), true);
    assert.equal(refs(await scoped(ALICE, PYTHON)).includes(shared), true);
    assert.equal(refs(await scoped(ALICE, EMPTY)).includes(shared), false);
  });

  it("returns nothing when no evidence is linked", async () => {
    assert.deepEqual(await scoped(ALICE, EMPTY), []);
  });

  it("isolates users: other learners' rows and competencies are never returned", async () => {
    const bob = await scoped(BOB, BOB_SKILL);
    assert.deepEqual(bob, []);
    assert.equal((await scoped(ALICE, JAVA)).some((item) => item.learnerUserId === BOB), false);
  });

  it("rejects a competency ID the learner does not own (request tampering)", async () => {
    await assert.rejects(() => resolveCompetencyScope(ALICE, BOB_SKILL, deps), (error: unknown) =>
      (error as { statusCode?: number }).statusCode === 404);
    await assert.rejects(() => resolveCompetencyScope(BOB, JAVA, deps), (error: unknown) =>
      (error as { statusCode?: number }).statusCode === 404);
  });
});

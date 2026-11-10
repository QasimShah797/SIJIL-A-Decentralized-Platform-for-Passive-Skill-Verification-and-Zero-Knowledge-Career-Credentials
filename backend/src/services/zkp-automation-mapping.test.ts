/**
 * Automated policy ZKP: real meets/below Groth16 proofs at the policy boundaries,
 * idempotent reuse, OAuth expiry, worker retry rules, and recruiter re-verification.
 * Artifacts are a development-only setup, not a production ceremony.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { generateScoreThresholdProof } from "./score-zkp-proof.service";
import {
  evaluateGitHubPolicy,
  githubEvidenceRef,
  resetGitHubAutomationQueueForTests,
  type GitHubAutomationDependencies,
} from "./github-zkp-automation.service";
import { assessmentEvidenceRef, verifyScorePolicyProof } from "./assessment-zkp-automation.service";
import { commitmentModulePath } from "./zkp-artifacts";
import { processZkpAutomationBatch } from "./zkp-automation-worker.service";
import { verifyPolicyRowForRecruiter, type PolicyVerifyDependencies } from "./zkp-policy-verify.service";
import {
  isRetryableErrorCode,
  type UpsertZkpPolicyVerificationInput,
  type ZkpPolicyStore,
  type ZkpPolicyVerificationRow,
} from "./zkp-policy-store";
import {
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  GITHUB_EVIDENCE_MAX_AGE_MS,
  GITHUB_POLICY_VERSION,
  GITHUB_REUSE_WINDOW_MS,
  GITHUB_ZKP_TYPE,
} from "./zkp-policy";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const ATTEMPT = "323e4567-e89b-42d3-a456-426614174000";
const REPO = "octo/demo";

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

function memoryStore(): ZkpPolicyStore & { rows: ZkpPolicyVerificationRow[]; upserts: number } {
  const rows: ZkpPolicyVerificationRow[] = [];
  const key = (r: { learnerUserId: string; zkpType: string; policyVersion: string; evidenceRef: string }) =>
    `${r.learnerUserId}|${r.zkpType}|${r.policyVersion}|${r.evidenceRef}`;
  const store = {
    rows,
    upserts: 0,
    async checkAvailability() { return { available: true as const }; },
    async upsert(input: UpsertZkpPolicyVerificationInput) {
      store.upserts += 1;
      const now = new Date().toISOString();
      const index = rows.findIndex((r) => key(r) === key(input));
      const row: ZkpPolicyVerificationRow = {
        id: index >= 0 ? rows[index].id : `row-${rows.length + 1}`,
        createdAt: index >= 0 ? rows[index].createdAt : now,
        updatedAt: now,
        ...input,
      };
      if (index >= 0) rows[index] = row; else rows.push(row);
      return row;
    },
    async getByEvidence(learnerUserId: string, zkpType: string, policyVersion: string, evidenceRef: string) {
      return rows.find((r) => key(r) === key({ learnerUserId, zkpType, policyVersion, evidenceRef })) ?? null;
    },
    async listForLearner(learnerUserId: string) { return rows.filter((r) => r.learnerUserId === learnerUserId); },
    async listRetryCandidates(limit: number, updatedBefore: string) {
      return rows
        .filter((r) => (r.outcome === "PENDING" || r.outcome === "ERROR") && r.updatedAt < updatedBefore)
        .filter((r) => r.outcome === "PENDING" || isRetryableErrorCode(r.errorCode))
        .slice(0, limit);
    },
    async listStaleGitHub(limit: number, freshBefore: string) {
      return rows
        .filter((r) => r.zkpType === GITHUB_ZKP_TYPE && (r.outcome === "MEETS_THRESHOLD" || r.outcome === "BELOW_THRESHOLD"))
        .filter((r) => (r.evidenceFreshAt ?? "") < freshBefore)
        .slice(0, limit);
    },
    async getByDisclosureTokenHash(tokenHash: string) {
      return rows.find((r) => r.disclosureTokenHash === tokenHash) ?? null;
    },
  };
  return store;
}

async function githubFixture(count: number) {
  const commitments = await loadGitHubCommitmentModule();
  const snapshots: Array<{ snapshotId: string; commitment: string; blinding: string; verifiedAt: string }> = [];
  let snapshotCalls = 0;
  const policyStore = memoryStore();
  const deps: GitHubAutomationDependencies = {
    policyStore,
    store: {
      async getOpening(snapshotId: string) {
        const s = snapshots.find((x) => x.snapshotId === snapshotId);
        return s ? { snapshotId, learnerId: LEARNER, contributionCount: count, blinding: s.blinding } : null;
      },
      async getSnapshot(snapshotId: string) {
        const s = snapshots.find((x) => x.snapshotId === snapshotId);
        return s ? { snapshotId, learnerId: LEARNER, githubUsername: "octo", repositoryFullName: REPO, verifiedAt: s.verifiedAt, commitment: s.commitment } : null;
      },
    } as unknown as GitHubAutomationDependencies["store"],
    createSnapshot: (async () => {
      snapshotCalls += 1;
      const snapshotId = `423e4567-e89b-42d3-a456-42661417400${snapshotCalls}`;
      const created = await commitments.createGitHubCommitment({ count, learnerId: LEARNER, snapshotId });
      const verifiedAt = new Date().toISOString();
      snapshots.push({ snapshotId, commitment: created.publicCommitment.commitment, blinding: created.opening.blinding, verifiedAt });
      return { snapshotId, repositoryFullName: REPO, verifiedAt, commitment: created.publicCommitment.commitment };
    }) as unknown as GitHubAutomationDependencies["createSnapshot"],
    generateProof: generateGitHubContributionProof,
    verifyProof: verifyGitHubContributionProof,
    verifyOpening: (input) => commitments.verifyGitHubOpening(input),
  };
  return { deps, policyStore, snapshots, snapshotCalls: () => snapshotCalls };
}

function recruiterDeps(fixture: Awaited<ReturnType<typeof githubFixture>>, now = Date.now()): PolicyVerifyDependencies {
  return {
    githubStore: fixture.deps.store,
    verifyGitHub: verifyGitHubContributionProof,
    verifyScore: verifyScorePolicyProof,
    loadCredential: async () => null,
    now: () => now,
  };
}

beforeEach(() => resetGitHubAutomationQueueForTests());

describe("github policy automation (threshold 70)", () => {
  it("proves MEETS_THRESHOLD at exactly 70 and recruiter re-verifies it", async () => {
    const fixture = await githubFixture(70);
    const result = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    assert.equal(result.status.outcome, "MEETS_THRESHOLD");
    assert.equal(result.status.circuitVariant, "meets");
    assert.equal(result.status.threshold, 70);
    assert.ok(result.disclosureToken);
    assert.doesNotMatch(JSON.stringify(result), /blinding|contributionCount/);

    const view = await verifyPolicyRowForRecruiter(fixture.policyStore.rows[0], recruiterDeps(fixture));
    assert.equal(view.outcome, "MEETS_THRESHOLD");
    assert.equal(view.check, "valid");
    assert.doesNotMatch(JSON.stringify(view), /blinding|contributionCount|"proof"/);
  });

  it("proves BELOW_THRESHOLD at 69 with a valid below proof, not a failed meets proof", async () => {
    const fixture = await githubFixture(69);
    const result = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    assert.equal(result.status.outcome, "BELOW_THRESHOLD");
    assert.equal(result.status.circuitVariant, "below");
    const row = fixture.policyStore.rows[0];
    const signals = row.publicSignals as [string, string];
    const belowValid = await verifyGitHubContributionProof({ circuitId: GITHUB_ZKP_TYPE, proof: row.proof, publicSignals: signals }, signals[1], "below");
    const meetsValid = await verifyGitHubContributionProof({ circuitId: GITHUB_ZKP_TYPE, proof: row.proof, publicSignals: signals }, signals[1], "meets");
    assert.equal(belowValid.cryptographicallyValid, true);
    assert.equal(meetsValid.cryptographicallyValid, false);

    const view = await verifyPolicyRowForRecruiter(row, recruiterDeps(fixture));
    assert.equal(view.outcome, "BELOW_THRESHOLD");
    assert.equal(view.check, "valid");
  });

  it("the provers refuse a variant that contradicts the private value", async () => {
    const commitments = await loadGitHubCommitmentModule();
    const snapshotId = "523e4567-e89b-42d3-a456-426614174000";
    const created = await commitments.createGitHubCommitment({ count: 70, learnerId: LEARNER, snapshotId });
    await assert.rejects(() => generateGitHubContributionProof({
      count: 70, blinding: created.opening.blinding, learnerId: LEARNER, snapshotId,
      threshold: 70, commitment: created.publicCommitment.commitment, variant: "below",
    }));
  });

  it("reuses a fresh verified outcome without a new snapshot and rotates the share code", async () => {
    const fixture = await githubFixture(70);
    const first = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    const second = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    assert.equal(fixture.snapshotCalls(), 1);
    assert.equal(second.reused, true);
    assert.equal(fixture.policyStore.rows.length, 1);
    assert.ok(second.disclosureToken && second.disclosureToken !== first.disclosureToken);

    const worker = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps, { issueDisclosure: false });
    assert.equal(worker.disclosureToken, null);
    assert.equal(fixture.snapshotCalls(), 1);
  });

  it("re-fetches GitHub once the reuse window has passed", async () => {
    const fixture = await githubFixture(70);
    await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps, { now: Date.now() + GITHUB_REUSE_WINDOW_MS + 1000 });
    assert.equal(fixture.snapshotCalls(), 2);
    assert.equal(fixture.policyStore.rows.length, 1);
  });

  it("records ERROR github_oauth_expired on a GitHub 401 without inventing a proof", async () => {
    const fixture = await githubFixture(70);
    fixture.deps.createSnapshot = (async () => {
      throw new Error("GitHub authentication failed: 401");
    }) as unknown as GitHubAutomationDependencies["createSnapshot"];
    const result = await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    assert.equal(result.status.outcome, "ERROR");
    assert.equal(result.status.errorCode, "github_oauth_expired");
    assert.equal(result.disclosureToken, null);
    const row = fixture.policyStore.rows[0];
    assert.equal(row.proof, null);
    assert.equal(isRetryableErrorCode(row.errorCode), false);

    const view = await verifyPolicyRowForRecruiter(row, recruiterDeps(fixture));
    assert.equal(view.outcome, "ERROR");
    assert.notEqual(view.outcome, "BELOW_THRESHOLD");
  });

  it("recruiter view rejects tampered thresholds, stale evidence, and swapped commitments", async () => {
    const fixture = await githubFixture(70);
    await evaluateGitHubPolicy(LEARNER, REPO, fixture.deps);
    const row = fixture.policyStore.rows[0];

    const lowered = { ...row, threshold: 1, publicSignals: ["1", (row.publicSignals as string[])[1]] };
    assert.equal((await verifyPolicyRowForRecruiter(lowered, recruiterDeps(fixture))).check, "policy_mismatch");

    const flipped = { ...row, outcome: "BELOW_THRESHOLD" as const, circuitVariant: "below" as const };
    const flippedView = await verifyPolicyRowForRecruiter(flipped, recruiterDeps(fixture));
    assert.equal(flippedView.outcome, "NOT_VERIFIED");
    assert.equal(flippedView.check, "invalid_proof");

    const stale = await verifyPolicyRowForRecruiter(row, recruiterDeps(fixture, Date.now() + GITHUB_EVIDENCE_MAX_AGE_MS + 1000));
    assert.equal(stale.check, "evidence_stale");

    const swapped = { ...row, publicSignals: ["70", "12345"] };
    assert.equal((await verifyPolicyRowForRecruiter(swapped, recruiterDeps(fixture))).check, "commitment_mismatch");
  });
});

describe("assessment policy proofs (threshold 60)", () => {
  async function scoreProof(score: number, variant: "meets" | "below") {
    const mod = await import(pathToFileURL(commitmentModulePath()).href) as {
      createAssessmentCommitment: (i: { score: number; learnerId: string; attemptId: string }) => Promise<{
        publicCommitment: { commitment: string }; opening: { blinding: string };
      }>;
      decimal: (v: bigint) => string;
      uuidToField: (v: string) => bigint;
    };
    const created = await mod.createAssessmentCommitment({ score, learnerId: LEARNER, attemptId: ATTEMPT });
    const result = await generateScoreThresholdProof({
      score,
      blinding: created.opening.blinding,
      learnerId: mod.decimal(mod.uuidToField(LEARNER)),
      attemptId: mod.decimal(mod.uuidToField(ATTEMPT)),
      commitment: created.publicCommitment.commitment,
      variant,
      threshold: 1,
    });
    return result;
  }

  it("proves 60 meets and 59 below, each only under its own key", async () => {
    const meets = await scoreProof(60, "meets");
    assert.equal(meets.publicSignals[0], "60");
    assert.equal(await verifyScorePolicyProof("meets", meets.publicSignals, meets.proof), true);
    assert.equal(await verifyScorePolicyProof("below", meets.publicSignals, meets.proof), false);

    const below = await scoreProof(59, "below");
    assert.equal(below.publicSignals[0], "60");
    assert.equal(await verifyScorePolicyProof("below", below.publicSignals, below.proof), true);
    assert.equal(await verifyScorePolicyProof("meets", below.publicSignals, below.proof), false);
  });

  it("ignores a client threshold and refuses contradictory variants", async () => {
    await assert.rejects(() => scoreProof(59, "meets"));
    await assert.rejects(() => scoreProof(60, "below"));
  });

  it("recruiter view reports a revoked credential as NOT_VERIFIED", async () => {
    const below = await scoreProof(59, "below");
    const row: ZkpPolicyVerificationRow = {
      id: "a", learnerUserId: LEARNER, zkpType: ASSESSMENT_ZKP_TYPE, policyVersion: ASSESSMENT_POLICY_VERSION,
      threshold: 60, outcome: "BELOW_THRESHOLD", circuitVariant: "below", evidenceRef: assessmentEvidenceRef(ATTEMPT),
      evidenceScope: { credentialId: "urn:cred:1", attemptId: ATTEMPT }, evidenceFreshAt: new Date().toISOString(),
      publicSignals: below.publicSignals, proof: below.proof, disclosureTokenHash: null, disclosureExpiresAt: null,
      errorCode: null, errorMessage: null, createdAt: "", updatedAt: "",
    };
    const credential = {
      user_id: LEARNER,
      revoked_at: null as string | null,
      credential_document: { credentialSubject: { assessmentCommitment: { commitment: below.publicSignals[1] } } },
    };
    const deps = (revoked: boolean): PolicyVerifyDependencies => ({
      githubStore: {} as PolicyVerifyDependencies["githubStore"],
      verifyGitHub: verifyGitHubContributionProof,
      verifyScore: verifyScorePolicyProof,
      loadCredential: (async () => ({ ...credential, revoked_at: revoked ? "2026-10-31T00:00:00Z" : null })) as unknown as PolicyVerifyDependencies["loadCredential"],
      now: Date.now,
    });
    assert.equal((await verifyPolicyRowForRecruiter(row, deps(true))).check, "evidence_revoked");
  });
});

describe("zkp automation worker", () => {
  it("retries only retryable errors after backoff and refreshes stale GitHub rows", async () => {
    const store = memoryStore();
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const base = {
      learnerUserId: LEARNER, zkpType: GITHUB_ZKP_TYPE, policyVersion: GITHUB_POLICY_VERSION, threshold: 70,
      circuitVariant: null, evidenceScope: { repositoryFullName: REPO }, evidenceFreshAt: null, publicSignals: null,
      proof: null, disclosureTokenHash: null, disclosureExpiresAt: null, errorMessage: null, createdAt: old, updatedAt: old,
    } as const;
    store.rows.push(
      { ...base, id: "1", outcome: "ERROR", evidenceRef: githubEvidenceRef("a/rate"), errorCode: "github_rate_limited" },
      { ...base, id: "2", outcome: "ERROR", evidenceRef: githubEvidenceRef("a/oauth"), errorCode: "github_oauth_expired" },
      { ...base, id: "3", outcome: "ERROR", evidenceRef: githubEvidenceRef("a/recent"), errorCode: "evaluation_failed", updatedAt: new Date().toISOString() },
      { ...base, id: "4", outcome: "MEETS_THRESHOLD", evidenceRef: githubEvidenceRef("a/stale"), errorCode: null, evidenceFreshAt: "2026-01-01T00:00:00.000Z" },
    );
    const retried: string[] = [];
    const result = await processZkpAutomationBatch({
      store,
      batchSize: 10,
      handlers: {
        retryGitHub: async (row) => { retried.push(row.id); },
        retryAssessment: async (row) => { retried.push(row.id); },
        scanNewAssessments: async () => 0,
      },
    });
    assert.deepEqual(retried.sort(), ["1", "4"]);
    assert.equal(result.processed, 2);
  });
});

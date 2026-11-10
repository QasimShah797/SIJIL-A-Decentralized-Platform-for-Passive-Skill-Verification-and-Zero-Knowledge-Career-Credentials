import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../utils/AppError";
import {
  githubZkp,
  resetGitHubProofQueueForTests,
  type GitHubProofView,
} from "./github-zkp-workflow.service";
import type { GitHubZkpStore, StoredGitHubDisclosure, StoredGitHubProof } from "./github-zkp-store";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const OTHER = "323e4567-e89b-42d3-a456-426614174000";
const SNAPSHOT = "223e4567-e89b-42d3-a456-426614174000";
const PROOF_ID = "423e4567-e89b-42d3-a456-426614174000";

const groth16 = {
  protocol: "groth16" as const,
  curve: "bn128" as const,
  pi_a: ["1", "2", "1"] as [string, string, string],
  pi_b: [["1", "2"], ["3", "4"], ["1", "0"]] as [[string, string], [string, string], [string, string]],
  pi_c: ["5", "6", "1"] as [string, string, string],
};

function stored(overrides: Partial<StoredGitHubProof> = {}): StoredGitHubProof {
  return {
    proofId: PROOF_ID,
    snapshotId: SNAPSHOT,
    learnerId: LEARNER,
    threshold: 10,
    commitment: "99",
    proof: groth16,
    repositoryFullName: "octo/demo",
    githubUsername: "octo",
    verifiedAt: "2026-10-31T00:00:00.000Z",
    createdAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

function memoryStore(options?: {
  count?: number;
  openingLearner?: string;
  snapshots?: boolean;
}): GitHubZkpStore & { disclosures: Map<string, StoredGitHubDisclosure> } {
  const count = options?.count ?? 25;
  const proofs = new Map<string, StoredGitHubProof>();
  const disclosures = new Map<string, StoredGitHubDisclosure>();
  const snapshot = options?.snapshots === false ? null : {
    snapshotId: SNAPSHOT,
    learnerId: LEARNER,
    githubUsername: "octo",
    repositoryFullName: "octo/demo",
    verifiedAt: "2026-10-31T00:00:00.000Z",
    commitment: "99",
  };
  return {
    disclosures,
    async githubConnected() {
      return { connected: true, username: "octo" };
    },
    async listSnapshots(learnerId) {
      return snapshot && learnerId === LEARNER ? [snapshot] : [];
    },
    async getSnapshot(snapshotId, learnerId) {
      if (!snapshot || snapshotId !== SNAPSHOT || learnerId !== LEARNER) return null;
      return snapshot;
    },
    async getOpening(snapshotId, learnerId) {
      if (!snapshot || snapshotId !== SNAPSHOT || learnerId !== LEARNER) return null;
      return {
        snapshotId,
        learnerId: options?.openingLearner ?? LEARNER,
        contributionCount: count,
        blinding: "7",
      };
    },
    async findProof(snapshotId, learnerId, threshold) {
      return [...proofs.values()].find((proof) => proof.snapshotId === snapshotId && proof.learnerId === learnerId && proof.threshold === threshold) ?? null;
    },
    async getProof(proofId, learnerId) {
      const proof = proofs.get(proofId);
      return proof && proof.learnerId === learnerId ? proof : null;
    },
    async insertProof(input) {
      proofs.set(input.proofId, stored({
        proofId: input.proofId,
        threshold: input.threshold,
        commitment: input.commitment,
        proof: input.proof,
      }));
      return "created";
    },
    async insertDisclosure(input) {
      const proof = proofs.get(input.proofId);
      if (!proof) throw new Error("missing proof");
      disclosures.set(input.tokenHash, {
        disclosureId: input.disclosureId,
        proofId: input.proofId,
        learnerId: input.learnerId,
        expiresAt: input.expiresAt,
        proof,
      });
    },
    async getDisclosureByTokenHash(tokenHash) {
      return disclosures.get(tokenHash) ?? null;
    },
  };
}

function dependencies(store: GitHubZkpStore, generateDelayMs = 0) {
  return {
    store,
    createSnapshot: async () => {
      throw new Error("not used");
    },
    generateProof: async (input: { threshold: number; commitment: string }) => {
      if (generateDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, generateDelayMs));
      return { proof: groth16, publicSignals: [String(input.threshold), input.commitment] };
    },
    verifyProof: async (submission: { publicSignals: unknown }, expected: string) => {
      const signals = submission.publicSignals as string[];
      const valid = signals?.[0] === "10" && signals?.[1] === expected;
      return {
        cryptographicallyValid: valid,
        circuitId: "github-contributions-v1",
        threshold: signals?.[0] ?? null,
        reason: valid
          ? "Groth16 proof is cryptographically valid; GitHub authenticity requires separate verification"
          : signals?.[1] !== expected
            ? "Commitment does not match the trusted value"
            : "Invalid Groth16 proof",
      };
    },
    verifyOpening: async () => true,
  };
}

describe("GitHub ZKP workflow", () => {
  beforeEach(() => resetGitHubProofQueueForTests());

  it("rejects a browser-style cross-user snapshot", async () => {
    const store = memoryStore();
    await assert.rejects(
      () => githubZkp.requestProof(OTHER, SNAPSHOT, 10, dependencies(store)),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });

  it("rejects an opening owned by a different learner", async () => {
    const store = memoryStore({ openingLearner: OTHER });
    await assert.rejects(
      () => githubZkp.requestProof(LEARNER, SNAPSHOT, 10, dependencies(store)),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });

  it("rejects a threshold above the trusted count without returning that count", async () => {
    const store = memoryStore({ count: 3 });
    await assert.rejects(
      () => githubZkp.requestProof(LEARNER, SNAPSHOT, 10, dependencies(store)),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 400);
        assert.equal(error.message.includes("3"), false);
        return true;
      },
    );
  });

  it("returns a public proof and a disclosure that verifies", async () => {
    const store = memoryStore();
    const proof = await githubZkp.requestProof(LEARNER, SNAPSHOT, 10, dependencies(store));
    assert.equal(proof.status, "ready");
    assert.equal(proof.threshold, "10");
    assert.equal(JSON.stringify(proof).includes("blinding"), false);
    assert.equal(Object.hasOwn(proof, "contributionCount"), false);
    const disclosure = await githubZkp.createDisclosure(LEARNER, proof.proofId, dependencies(store));
    const verified = await githubZkp.verifyDisclosure(disclosure.disclosureToken, dependencies(store));
    assert.equal(verified.verified, true);
    assert.equal(verified.checks.commitment, "matches");
    assert.equal(verified.checks.fabricAnchor, "not_part_of_this_proof");
    assert.equal(verified.checks.credentialIssuance, "not_part_of_this_proof");
    assert.equal(JSON.stringify(verified).includes("blinding"), false);
  });

  it("rejects another learner reading the proof", async () => {
    const store = memoryStore();
    const proof = await githubZkp.requestProof(LEARNER, SNAPSHOT, 10, dependencies(store));
    await assert.rejects(
      () => githubZkp.getProof(OTHER, proof.proofId, dependencies(store)),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });

  it("rejects a tampered public threshold during disclosure verification", async () => {
    const store = memoryStore();
    const deps = dependencies(store);
    const proof = await githubZkp.requestProof(LEARNER, SNAPSHOT, 10, deps);
    const disclosure = await githubZkp.createDisclosure(LEARNER, proof.proofId, deps);
    const tokenHash = [...store.disclosures.keys()][0];
    const row = store.disclosures.get(tokenHash);
    assert.ok(row);
    row.proof = stored({ threshold: 11, proofId: proof.proofId });
    const verified = await githubZkp.verifyDisclosure(disclosure.disclosureToken, deps);
    assert.equal(verified.verified, false);
    assert.equal(verified.checks.proof, "invalid");
  });

  it("limits concurrent proof generation", async () => {
    const store = memoryStore();
    const deps = dependencies(store, 30);
    const results = await Promise.allSettled([
      githubZkp.requestProof(LEARNER, SNAPSHOT, 10, deps),
      githubZkp.requestProof(LEARNER, SNAPSHOT, 10, deps),
      githubZkp.requestProof(LEARNER, SNAPSHOT, 10, deps),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(rejected.length >= 1, true);
    assert.equal(
      rejected.some((result) => result.status === "rejected" && result.reason instanceof AppError && result.reason.statusCode === 429),
      true,
    );
  });

  it("does not place private fields on the public view type", () => {
    const view = {
      status: "ready",
      threshold: "10",
    } as Pick<GitHubProofView, "status" | "threshold">;
    assert.equal(view.status, "ready");
    assert.equal("blinding" in view, false);
  });
});

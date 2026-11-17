import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { githubCommitmentModulePath } from "./github-zkp-artifacts";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const SNAPSHOT = "123e4567-e89b-42d3-a456-426614174001";

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

describe("development GitHub Groth16 proof", () => {
  it("proves 120 attributed commits meet 100 and rejects a swapped threshold or commitment", async () => {
    const commitmentModule = await import(pathToFileURL(githubCommitmentModulePath()).href) as {
      createGitHubCommitment: (input: { count: number; learnerId: string; snapshotId: string; blinding: string }) => Promise<{
        publicCommitment: { commitment: string };
        opening: { blinding: string };
      }>;
    };
    const created = await commitmentModule.createGitHubCommitment({
      count: 120,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
      blinding: "42",
    });
    const proof = await generateGitHubContributionProof({
      count: 120,
      blinding: created.opening.blinding,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
      threshold: 100,
      commitment: created.publicCommitment.commitment,
    });
    assert.equal(proof.publicSignals[0], "100");
    assert.equal(proof.publicSignals[1], created.publicCommitment.commitment);
    const accepted = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof: proof.proof,
      publicSignals: proof.publicSignals,
    }, created.publicCommitment.commitment);
    assert.equal(accepted.cryptographicallyValid, true);
    const wrongThreshold = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof: proof.proof,
      publicSignals: ["150", created.publicCommitment.commitment],
    }, created.publicCommitment.commitment);
    assert.equal(wrongThreshold.cryptographicallyValid, false);
    const wrongCommitment = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof: proof.proof,
      publicSignals: proof.publicSignals,
    }, "1");
    assert.equal(wrongCommitment.cryptographicallyValid, false);
    const tampered = structuredClone(proof.proof) as { pi_a: string[] };
    tampered.pi_a[0] = "1";
    const invalid = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof: tampered,
      publicSignals: proof.publicSignals,
    }, created.publicCommitment.commitment);
    assert.equal(invalid.cryptographicallyValid, false);
    await assert.rejects(() => generateGitHubContributionProof({
      count: 80,
      blinding: created.opening.blinding,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
      threshold: 100,
      commitment: created.publicCommitment.commitment,
    }), /do not meet the threshold/);
  });
});

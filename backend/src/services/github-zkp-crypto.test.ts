/**
 * Real Poseidon and Groth16 checks for github-contributions-v1.
 * The pinned key is a development setup, not a production ceremony.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { resolveGitHubZkpArtifactDir } from "./github-zkp-artifacts";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const SNAPSHOT = "223e4567-e89b-42d3-a456-426614174000";
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

describe("github-contributions-v1 cryptography", () => {
  it("rejects out-of-range field elements and a bad opening", async () => {
    const commitment = await loadGitHubCommitmentModule();
    await assert.rejects(
      () => commitment.createGitHubCommitment({
        count: 4,
        learnerId: LEARNER,
        snapshotId: SNAPSHOT,
        blinding: FIELD.toString(),
      }),
      /BN254 field/,
    );
    const created = await commitment.createGitHubCommitment({
      count: 4,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
    });
    assert.equal(await commitment.verifyGitHubOpening({
      ...created.opening,
      commitment: created.publicCommitment.commitment,
    }), true);
    assert.equal(await commitment.verifyGitHubOpening({
      ...created.opening,
      count: 5,
      commitment: created.publicCommitment.commitment,
    }), false);
  });

  it("accepts a real proof and rejects tampered public inputs", async () => {
    assert.ok(resolveGitHubZkpArtifactDir(), "pinned GitHub artifacts are required");
    const commitment = await loadGitHubCommitmentModule();
    const created = await commitment.createGitHubCommitment({
      count: 12,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
    });
    const { proof, publicSignals } = await generateGitHubContributionProof({
      count: 12,
      blinding: created.opening.blinding,
      learnerId: LEARNER,
      snapshotId: SNAPSHOT,
      threshold: 10,
      commitment: created.publicCommitment.commitment,
    });
    const valid = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof,
      publicSignals,
    }, created.publicCommitment.commitment);
    assert.equal(valid.cryptographicallyValid, true);

    const wrongThreshold = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof,
      publicSignals: ["9", publicSignals[1]],
    }, created.publicCommitment.commitment);
    assert.equal(wrongThreshold.cryptographicallyValid, false);

    const wrongCommitment = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof,
      publicSignals,
    }, "1");
    assert.equal(wrongCommitment.cryptographicallyValid, false);
    assert.equal(wrongCommitment.reason, "Commitment does not match the trusted value");

    const swapped = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof,
      publicSignals: [publicSignals[1], publicSignals[0]],
    }, created.publicCommitment.commitment);
    assert.equal(swapped.cryptographicallyValid, false);

    const broken = structuredClone(proof) as { pi_a: string[] };
    broken.pi_a = ["2", "2", "1"];
    const tampered = await verifyGitHubContributionProof({
      circuitId: "github-contributions-v1",
      proof: broken,
      publicSignals,
    }, created.publicCommitment.commitment);
    assert.equal(tampered.cryptographicallyValid, false);

    await assert.rejects(
      () => generateGitHubContributionProof({
        count: 4,
        blinding: created.opening.blinding,
        learnerId: LEARNER,
        snapshotId: SNAPSHOT,
        threshold: 10,
        commitment: created.publicCommitment.commitment,
      }),
      /do not meet the threshold/,
    );
  });
});

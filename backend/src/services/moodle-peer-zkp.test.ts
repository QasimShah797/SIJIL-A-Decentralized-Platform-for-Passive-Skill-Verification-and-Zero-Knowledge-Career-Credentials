/**
 * Real Poseidon + Groth16 checks for moodle-completion-v1 and peer-review-count-v1.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generateMoodleCompletionProof } from "./moodle-zkp-proof.service";
import { moodleCommitmentModulePath, resolveMoodleZkpArtifactDir, MOODLE_ARTIFACT_FILES } from "./moodle-zkp-artifacts";
import { generatePeerReviewCountProof } from "./peer-zkp-proof.service";
import { peerCommitmentModulePath, resolvePeerZkpArtifactDir, PEER_ARTIFACT_FILES } from "./peer-zkp-artifacts";

const requireSnarkjs = createRequire(__filename);
const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const EVIDENCE = "223e4567-e89b-42d3-a456-426614174111";

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

describe("moodle-completion-v1 cryptography", () => {
  it("generates and verifies a real meets proof; rejects below-threshold and tampered signals", async () => {
    assert.ok(resolveMoodleZkpArtifactDir(), "Moodle artifacts required");
    const mod = await import(pathToFileURL(moodleCommitmentModulePath()).href) as {
      createMoodleCommitment: (input: {
        completed: number;
        required: number;
        learnerId: string;
        evidenceId: string;
      }) => Promise<{
        publicCommitment: { commitment: string };
        opening: { blinding: string };
      }>;
    };
    const created = await mod.createMoodleCommitment({
      completed: 3,
      required: 4,
      learnerId: LEARNER,
      evidenceId: EVIDENCE,
    });
    const { proof, publicSignals } = await generateMoodleCompletionProof({
      completed: 3,
      required: 4,
      blinding: created.opening.blinding,
      learnerId: LEARNER,
      evidenceId: EVIDENCE,
      commitment: created.publicCommitment.commitment,
      thresholdPercent: 50,
    });
    assert.deepEqual(publicSignals, ["50", created.publicCommitment.commitment]);

    const snarkjs = requireSnarkjs("snarkjs") as {
      groth16: { verify: (vk: object, signals: string[], proof: unknown) => Promise<boolean> };
    };
    const vk = JSON.parse(
      readFileSync(path.join(resolveMoodleZkpArtifactDir()!, MOODLE_ARTIFACT_FILES.verificationKey), "utf8"),
    );
    assert.equal(await snarkjs.groth16.verify(vk, publicSignals, proof), true);
    assert.equal(await snarkjs.groth16.verify(vk, ["49", publicSignals[1]], proof), false);

    await assert.rejects(
      () => generateMoodleCompletionProof({
        completed: 1,
        required: 4,
        blinding: created.opening.blinding,
        learnerId: LEARNER,
        evidenceId: EVIDENCE,
        commitment: created.publicCommitment.commitment,
        thresholdPercent: 50,
      }),
      /does not meet/,
    );
  });
});

describe("peer-review-count-v1 cryptography", () => {
  it("generates and verifies a real meets proof; rejects unmet and tampered signals", async () => {
    assert.ok(resolvePeerZkpArtifactDir(), "Peer artifacts required");
    const mod = await import(pathToFileURL(peerCommitmentModulePath()).href) as {
      createPeerReviewCommitment: (input: {
        count: number;
        learnerId: string;
        evidenceId: string;
      }) => Promise<{
        publicCommitment: { commitment: string };
        opening: { blinding: string };
      }>;
    };
    const created = await mod.createPeerReviewCommitment({
      count: 2,
      learnerId: LEARNER,
      evidenceId: EVIDENCE,
    });
    const { proof, publicSignals } = await generatePeerReviewCountProof({
      count: 2,
      blinding: created.opening.blinding,
      learnerId: LEARNER,
      evidenceId: EVIDENCE,
      commitment: created.publicCommitment.commitment,
      threshold: 1,
    });
    assert.deepEqual(publicSignals, ["1", created.publicCommitment.commitment]);

    const snarkjs = requireSnarkjs("snarkjs") as {
      groth16: { verify: (vk: object, signals: string[], proof: unknown) => Promise<boolean> };
    };
    const vk = JSON.parse(
      readFileSync(path.join(resolvePeerZkpArtifactDir()!, PEER_ARTIFACT_FILES.verificationKey), "utf8"),
    );
    assert.equal(await snarkjs.groth16.verify(vk, publicSignals, proof), true);
    assert.equal(await snarkjs.groth16.verify(vk, ["2", publicSignals[1]], proof), false);

    await assert.rejects(
      () => generatePeerReviewCountProof({
        count: 0,
        blinding: created.opening.blinding,
        learnerId: LEARNER,
        evidenceId: EVIDENCE,
        commitment: created.publicCommitment.commitment,
        threshold: 1,
      }),
      /does not meet/,
    );
  });
});

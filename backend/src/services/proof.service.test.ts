import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSelectiveDisclosureProof,
  canonicalProofTimestamp,
  hashDisclosurePayload,
  verifySelectiveDisclosureProof,
} from "./proof.service";

const BASE = {
  learnerDid: "did:key:z6MkwTestLearner111111111111111111111111111",
  competencyId: "cb3914a3-db4e-4d97-95e5-2ecec87c9f29",
  learnerId: "f0620086-9dbf-4bdf-a743-331111353d3e",
  payloadHash: "aae890d4792099719840b6e565aad6fab77b9abc48f7521e2b3ea54c371da23d",
};

describe("selective disclosure presentation proof", () => {
  it("canonicalizes Z and +00:00 timestamps to the same instant", () => {
    assert.equal(
      canonicalProofTimestamp("2026-11-28T22:52:38.327Z"),
      canonicalProofTimestamp("2026-11-28T22:52:38.327+00:00"),
    );
  });

  it("verifies a freshly signed proof (positive)", () => {
    const createdAt = "2026-11-19T18:36:32.223+00:00";
    const expiresAt = "2026-11-28T22:52:38.327Z";
    const proof = buildSelectiveDisclosureProof({ ...BASE, createdAt, expiresAt });
    assert.equal(
      verifySelectiveDisclosureProof({
        ...BASE,
        // Simulate Postgres timestamptz round-trip on both columns.
        createdAt: "2026-11-19T18:36:32.223+00:00",
        expiresAt: "2026-11-28T22:52:38.327+00:00",
        proof: { proofValue: proof.proofValue },
      }),
      true,
    );
  });

  it("rejects a tampered payload hash", () => {
    const proof = buildSelectiveDisclosureProof({
      ...BASE,
      createdAt: "2026-11-19T18:36:32.223Z",
      expiresAt: "2026-12-21T22:50:49.818Z",
    });
    assert.equal(
      verifySelectiveDisclosureProof({
        ...BASE,
        payloadHash: "ff".repeat(32),
        createdAt: "2026-11-19T18:36:32.223Z",
        expiresAt: "2026-12-21T22:50:49.818Z",
        proof: { proofValue: proof.proofValue },
      }),
      false,
    );
  });

  it("rejects a mutated proofValue", () => {
    const proof = buildSelectiveDisclosureProof({
      ...BASE,
      createdAt: "2026-11-19T18:36:32.223Z",
      expiresAt: "2026-12-21T22:50:49.818Z",
    });
    const mutated = `0x${"ab".repeat(32)}`;
    assert.notEqual(mutated, proof.proofValue);
    assert.equal(
      verifySelectiveDisclosureProof({
        ...BASE,
        createdAt: "2026-11-19T18:36:32.223Z",
        expiresAt: "2026-12-21T22:50:49.818Z",
        proof: { proofValue: mutated },
      }),
      false,
    );
  });

  it("rejects competency or learner identity swaps", () => {
    const proof = buildSelectiveDisclosureProof({
      ...BASE,
      createdAt: "2026-11-19T18:36:32.223Z",
      expiresAt: "2026-12-21T22:50:49.818Z",
    });
    assert.equal(
      verifySelectiveDisclosureProof({
        ...BASE,
        competencyId: "00000000-0000-4000-8000-000000000099",
        createdAt: "2026-11-19T18:36:32.223Z",
        expiresAt: "2026-12-21T22:50:49.818Z",
        proof: { proofValue: proof.proofValue },
      }),
      false,
    );
  });

  it("signs null learnerDid with the same fallback DID used in verificationMethod", () => {
    const proof = buildSelectiveDisclosureProof({
      ...BASE,
      learnerDid: null,
      createdAt: "2026-11-19T18:36:32.223Z",
      expiresAt: "2026-12-21T22:50:49.818Z",
    });
    const recoveredDid = proof.verificationMethod.split("#")[0] ?? null;
    assert.equal(recoveredDid, `did:sijil:learner:${BASE.learnerId}`);
    assert.equal(
      verifySelectiveDisclosureProof({
        ...BASE,
        learnerDid: recoveredDid,
        createdAt: "2026-11-19T18:36:32.223+00:00",
        expiresAt: "2026-12-21T22:50:49.818+00:00",
        proof: { proofValue: proof.proofValue },
      }),
      true,
    );
  });

  it("hashes equal payloads to the same digest regardless of key order", () => {
    const a = hashDisclosurePayload({ b: 1, a: { z: true, y: 2 } });
    const b = hashDisclosurePayload({ a: { y: 2, z: true }, b: 1 });
    assert.equal(a, b);
  });
});

/**
 * Recruiter verification of reusable score-threshold-v1 proofs.
 * One case generates and checks a real Groth16 proof. The others reuse that proof
 * or a stubbed verifier so credential and ledger failures stay isolated.
 */
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { resolveZkpArtifactDir } from "./zkp-artifacts";
import { evaluateReusableScoreProof, readPinnedVerificationKey, type ReusableScoreProofInput, type ZkpCredentialRecord } from "./zkp-verify";
import type { VerifyCredentialResult } from "./ledger.types";

const LEARNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185450";
const OTHER_COMMITMENT = "4507768595048672970581706270570294537909576572913353501816464357845450185451";

const keys = generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const pinned = readPinnedVerificationKey();

let proof: ReusableScoreProofInput["submission"]["proof"];
let signals: [string, string];

function verify(hashHex: string, proofValue: string): boolean {
  return verifySha256Hash(hashHex, proofValue, publicPem);
}

function ledger(view: VerifyCredentialResult | "disabled" | "down") {
  return {
    isEnabled: () => view !== "disabled",
    verifyCredential: async (): Promise<VerifyCredentialResult> => {
      if (view === "disabled" || view === "down") throw new Error("ledger down");
      return view;
    },
  };
}

function signedCredential(commitment = COMMITMENT): ZkpCredentialRecord {
  const built = buildCredentialDocument({
    credentialUri: "urn:uuid:sijil:test:circuits",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6Mktest",
    skill: "Circuits",
    evidenceCount: 1,
    evidenceHashes: ["abc"],
    validFrom: "2026-10-17T00:00:00.000Z",
    assessmentCommitment: {
      version: 1,
      scheme: "poseidon-bn254-v1",
      circuitId: "score-threshold-v1",
      attemptId: ATTEMPT,
      commitment,
    },
  });
  return {
    ledgerId: "11111111-1111-4111-8111-111111111111",
    credentialUri: built.document.id,
    storedHash: built.sha256Hash,
    credentialDocument: built.document,
    proofValue: signSha256Hash(built.sha256Hash, privatePem),
    revokedAt: null,
  };
}

function activeLedger(): VerifyCredentialResult {
  return { exists: true, hashMatches: true, status: "active" };
}

function input(overrides: Partial<ReusableScoreProofInput> = {}): ReusableScoreProofInput {
  if (!pinned) throw new Error("Pinned verification key is missing");
  return {
    authorized: true,
    credential: signedCredential(),
    submission: {
      circuitId: "score-threshold-v1",
      proof,
      publicSignals: signals,
    },
    verifySignature: verify,
    ledger: ledger(activeLedger()),
    verificationKey: pinned.key,
    verificationKeySha256: pinned.sha256,
    pinnedVerificationKeySha256: pinned.pinnedSha256,
    ...overrides,
  };
}

function assertNoPrivateData(value: unknown): void {
  const forbidden = new Set(["score", "blinding", "witness", "answerKey", "learnerAnswers", "locallyVerified"]);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    for (const [key, nested] of Object.entries(node)) {
      assert.equal(forbidden.has(key), false, key);
      assert.notEqual(nested, "73");
      assert.notEqual(nested, "42");
      visit(nested);
    }
  };
  visit(value);
}

before(async () => {
  const require = createRequire(__filename);
  const snarkjs = require("snarkjs") as {
    groth16: {
      fullProve: (circuitInput: Record<string, string>, wasmFile: string, zkeyFile: string) => Promise<{ proof: unknown; publicSignals: string[] }>;
    };
  };
  const buildDir = resolveZkpArtifactDir();
  if (!buildDir) throw new Error("score-threshold-v1 artifact bundle is missing");
  const commitmentModule = await import(
    pathToFileURL(path.resolve(__dirname, "../zkp/commitment.mjs")).href
  );
  const commitment = commitmentModule as {
    decimal: (value: bigint | number) => string;
    uuidToField: (value: string) => bigint;
  };
  const proved = await snarkjs.groth16.fullProve({
    score: "73",
    blinding: "42",
    learnerId: commitment.decimal(commitment.uuidToField(LEARNER)),
    attemptId: commitment.decimal(commitment.uuidToField(ATTEMPT)),
    threshold: "60",
    commitment: COMMITMENT,
  }, path.join(buildDir, "score_threshold.wasm"), path.join(buildDir, "score_threshold_final.zkey"));
  proof = proved.proof;
  signals = [proved.publicSignals[0], proved.publicSignals[1]];
});

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

describe("reusable score-threshold proof verification", () => {
  it("verifies a real Groth16 proof bound to the signed commitment", async () => {
    const decision = await evaluateReusableScoreProof(input());
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, true);
    assert.equal(decision.result.proofBinding, "reusable-credential-bound-v1");
    assert.equal(decision.result.threshold, "60");
    assert.equal(decision.result.checks.signature, "valid");
    assert.equal(decision.result.checks.documentHash, "matches");
    assert.equal(decision.result.checks.proof, "valid");
    assert.equal(decision.result.checks.commitment, "matches");
    assert.equal(decision.result.checks.fabric, "active");
    assert.equal(decision.result.checks.verificationKey, "pinned");
    assert.match(decision.result.message, /meets the required assessment threshold/);
    assert.match(decision.result.replay, /does not include a recruiter challenge/);
    assertNoPrivateData(decision);
  });

  it("rejects an invalid Groth16 proof", async () => {
    const broken = structuredClone(proof) as { pi_a: string[] };
    broken.pi_a[0] = `${broken.pi_a[0].slice(0, -1)}${broken.pi_a[0].endsWith("1") ? "2" : "1"}`;
    const decision = await evaluateReusableScoreProof(input({ submission: { circuitId: "score-threshold-v1", proof: broken, publicSignals: signals } }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.equal(decision.result.checks.proof, "invalid");
    assertNoPrivateData(decision);
  });

  it("rejects a modified public threshold", async () => {
    const decision = await evaluateReusableScoreProof(input({
      submission: { circuitId: "score-threshold-v1", proof, publicSignals: ["61", COMMITMENT] },
    }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.equal(decision.result.checks.proof, "invalid");
  });

  it("rejects a modified public commitment", async () => {
    const decision = await evaluateReusableScoreProof(input({
      submission: { circuitId: "score-threshold-v1", proof, publicSignals: ["60", OTHER_COMMITMENT] },
    }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.equal(decision.result.checks.commitment, "mismatch");
  });

  it("rejects a proof bound to another credential", async () => {
    const decision = await evaluateReusableScoreProof(input({
      credential: signedCredential(OTHER_COMMITMENT),
    }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.equal(decision.result.checks.commitment, "mismatch");
  });

  it("rejects a tampered issuer signature", async () => {
    const credential = signedCredential();
    const decision = await evaluateReusableScoreProof(input({
      credential: { ...credential, proofValue: "AA" },
    }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.equal(decision.result.checks.signature, "invalid");
  });

  it("rejects a revoked credential", async () => {
    const decision = await evaluateReusableScoreProof(input({
      credential: { ...signedCredential(), revokedAt: "2026-10-17T01:00:00.000Z" },
    }));
    assert.equal(decision.httpStatus, 200);
    if (decision.httpStatus !== 200) return;
    assert.equal(decision.result.verified, false);
    assert.match(decision.result.message, /revoked/);
  });

  it("rejects a missing or unsupported circuit", async () => {
    const missing = await evaluateReusableScoreProof(input({
      credential: (() => {
        const built = buildCredentialDocument({
          credentialUri: "urn:uuid:sijil:test:circuits",
          issuerDid: "did:web:issuer.cust.edu.pk",
          holderDid: "did:key:z6Mktest",
          skill: "Circuits",
          evidenceCount: 1,
          evidenceHashes: ["abc"],
          validFrom: "2026-10-17T00:00:00.000Z",
        });
        return {
          ledgerId: "11111111-1111-4111-8111-111111111111",
          credentialUri: built.document.id,
          storedHash: built.sha256Hash,
          credentialDocument: built.document,
          proofValue: signSha256Hash(built.sha256Hash, privatePem),
          revokedAt: null,
        };
      })(),
    }));
    assert.equal(missing.httpStatus, 200);
    if (missing.httpStatus === 200) assert.equal(missing.result.checks.commitment, "missing");

    const unsupported = await evaluateReusableScoreProof(input({
      submission: { circuitId: "score-threshold-v2", proof, publicSignals: signals },
    }));
    assert.equal(unsupported.httpStatus, 200);
    if (unsupported.httpStatus === 200) assert.equal(unsupported.result.checks.circuit, "unsupported");
  });

  it("rejects a missing Fabric anchor, a hash mismatch, a revoked anchor, and an unavailable ledger", async () => {
    const missing = await evaluateReusableScoreProof(input({ ledger: ledger({ exists: false, hashMatches: false, status: "missing" }) }));
    const mismatch = await evaluateReusableScoreProof(input({ ledger: ledger({ exists: true, hashMatches: false, status: "active" }) }));
    const revoked = await evaluateReusableScoreProof(input({ ledger: ledger({ exists: true, hashMatches: true, status: "revoked" }) }));
    const unavailable = await evaluateReusableScoreProof(input({ ledger: ledger("disabled") }));
    for (const decision of [missing, mismatch, revoked, unavailable]) {
      assert.equal(decision.httpStatus, 200);
      if (decision.httpStatus !== 200) continue;
      assert.equal(decision.result.verified, false);
      assertNoPrivateData(decision);
    }
    if (missing.httpStatus === 200) assert.equal(missing.result.checks.fabric, "missing");
    if (mismatch.httpStatus === 200) assert.equal(mismatch.result.checks.fabric, "hash_mismatch");
    if (revoked.httpStatus === 200) assert.equal(revoked.result.checks.fabric, "revoked");
    if (unavailable.httpStatus === 200) assert.equal(unavailable.result.checks.fabric, "unavailable");
  });

  it("rejects an unauthorized recruiter without disclosing the credential", async () => {
    const decision = await evaluateReusableScoreProof(input({ authorized: false }));
    assert.equal(decision.httpStatus, 403);
    assert.match(decision.message, /Not authorized/);
    assert.equal(JSON.stringify(decision).includes("73"), false);
    assert.equal("result" in decision, false);
  });

  it("rejects an oversized or malformed proof", async () => {
    const oversized = await evaluateReusableScoreProof(input({
      submission: {
        circuitId: "score-threshold-v1",
        proof: { ...(proof as object), padding: "x".repeat(20_000) },
        publicSignals: signals,
      },
    }));
    const malformed = await evaluateReusableScoreProof(input({
      submission: { circuitId: "score-threshold-v1", proof: { protocol: "groth16" }, publicSignals: ["60", COMMITMENT] },
    }));
    assert.equal(oversized.httpStatus, 400);
    assert.equal(malformed.httpStatus, 400);
    assert.equal(JSON.stringify(oversized).includes("73"), false);
  });

  it("does not accept a mismatched verification key or a browser local-check flag", async () => {
    let called = false;
    const mismatch = await evaluateReusableScoreProof(input({
      verificationKeySha256: "ab".repeat(32),
      verifyGroth16: async () => {
        called = true;
        return true;
      },
    }));
    assert.equal(mismatch.httpStatus, 200);
    if (mismatch.httpStatus === 200) {
      assert.equal(mismatch.result.verified, false);
      assert.equal(mismatch.result.checks.verificationKey, "mismatch");
    }
    assert.equal(called, false);

    const browserFlag = await evaluateReusableScoreProof({
      ...input({
        verifyGroth16: async () => false,
      }),
      submission: {
        circuitId: "score-threshold-v1",
        proof,
        publicSignals: signals,
        locallyVerified: true,
      } as ReusableScoreProofInput["submission"],
    });
    assert.equal(browserFlag.httpStatus, 200);
    if (browserFlag.httpStatus === 200) assert.equal(browserFlag.result.verified, false);
  });
});

/**
 * Real Groth16 checks for recruiter-selected score requests.
 * Ledger, database, and issuer keys are injected. The proof is not mocked.
 */
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { resolveZkpArtifactDir } from "./zkp-artifacts";
import { readPinnedVerificationKey } from "./zkp-verify";
import { createMemoryScoreRequestStore } from "./zkp-score-request.store";
import {
  createScoreRequest,
  submitScoreRequest,
  type ScoreRequestDependencies,
  type ScoreRequestLedger,
} from "./zkp-score-request";
import type { CredentialRow } from "../types/credentials.types";
import type { VerifyCredentialResult } from "./ledger.types";

const LEARNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RECRUITER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-11-15T12:00:00.000Z");

const keys = generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const pinned = readPinnedVerificationKey();

let signals60: [string, string];
let proof60: unknown;
let commitment60: string;
let signals73: [string, string];
let proof73: unknown;
let commitment73: string;
let wrongKey: object;

function verify(hashHex: string, proofValue: string): boolean {
  return verifySha256Hash(hashHex, proofValue, publicPem);
}

function ledger(view: VerifyCredentialResult | "disabled"): ScoreRequestLedger {
  return {
    isEnabled: () => view !== "disabled",
    verifyCredential: async () => {
      if (view === "disabled") throw new Error("ledger down");
      return view;
    },
  };
}

function credential(commitment: string, overrides: Partial<CredentialRow> = {}): CredentialRow {
  const built = buildCredentialDocument({
    credentialUri: "urn:uuid:sijil:test:score-request",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6Mktest",
    skill: "Circuits",
    evidenceCount: 1,
    evidenceHashes: ["abc"],
    validFrom: "2026-11-15T00:00:00.000Z",
    assessmentCommitment: {
      version: 1,
      scheme: "poseidon-bn254-v1",
      circuitId: "score-threshold-v1",
      attemptId: ATTEMPT,
      commitment,
    },
  });
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: LEARNER,
    credential_uri: built.document.id,
    credential_hash: built.sha256Hash,
    credential_document: built.document as unknown as Record<string, unknown>,
    proof: { proofValue: signSha256Hash(built.sha256Hash, privatePem) },
    revoked_at: null,
    ...overrides,
  } as CredentialRow;
}

function deps(store = createMemoryScoreRequestStore(), options: {
  ledger?: ScoreRequestLedger;
  verifyGroth16?: ScoreRequestDependencies["verifyGroth16"];
  now?: number;
  commitment?: string;
  readVerificationKey?: ScoreRequestDependencies["readVerificationKey"];
} = {}): ScoreRequestDependencies {
  if (!pinned) throw new Error("Pinned verification key is missing");
  const row = credential(options.commitment ?? commitment60);
  return {
    store,
    now: () => options.now ?? NOW,
    loadCredential: async () => row,
    verifySignature: verify,
    verifyGroth16: options.verifyGroth16 ?? (async (key, publicSignals, proof) => {
      const snarkjs = createRequire(__filename)("snarkjs") as {
        groth16: { verify: (verificationKey: object, signals: string[], candidate: unknown) => Promise<boolean> };
      };
      return snarkjs.groth16.verify(key, publicSignals, proof);
    }),
    readVerificationKey: options.readVerificationKey ?? (() => ({ key: pinned.key })),
    ledger: options.ledger ?? ledger({ exists: true, hashMatches: true, status: "active" }),
  };
}

async function openRequest(dependencies: ScoreRequestDependencies, threshold = 60, commitment = commitment60) {
  return createScoreRequest({
    recruiterUserId: RECRUITER,
    learnerUserId: LEARNER,
    credential: credential(commitment),
    threshold,
    shareToken: "share-token-1234567890",
    dependencies,
  });
}

before(async () => {
  const require = createRequire(__filename);
  const snarkjs = require("snarkjs") as {
    groth16: {
      fullProve: (input: Record<string, string>, wasmFile: string, zkeyFile: string) => Promise<{ proof: unknown; publicSignals: string[] }>;
      verify: (verificationKey: object, signals: string[], candidate: unknown) => Promise<boolean>;
    };
  };
  const buildDir = resolveZkpArtifactDir();
  if (!buildDir || !pinned) throw new Error("score-threshold-v1 artifact bundle is missing");
  const commitmentModule = await import(pathToFileURL(path.resolve(__dirname, "../zkp/commitment.mjs")).href) as {
    createAssessmentCommitment: (input: { score: number; learnerId: string; attemptId: string; blinding: bigint }) => Promise<{ publicCommitment: { commitment: string } }>;
    decimal: (value: bigint | number) => string;
    uuidToField: (value: string) => bigint;
  };
  const created = await commitmentModule.createAssessmentCommitment({
    score: 60,
    learnerId: LEARNER,
    attemptId: ATTEMPT,
    blinding: 42n,
  });
  commitment60 = created.publicCommitment.commitment;
  const proved = await snarkjs.groth16.fullProve({
    score: "60",
    blinding: "42",
    learnerId: commitmentModule.decimal(commitmentModule.uuidToField(LEARNER)),
    attemptId: commitmentModule.decimal(commitmentModule.uuidToField(ATTEMPT)),
    threshold: "60",
    commitment: commitment60,
  }, path.join(buildDir, "score_threshold.wasm"), path.join(buildDir, "score_threshold_final.zkey"));
  proof60 = proved.proof;
  signals60 = [proved.publicSignals[0], proved.publicSignals[1]];
  if (!await snarkjs.groth16.verify(pinned.key, signals60, proof60)) {
    throw new Error("Pinned verification key rejected the equal-score proof");
  }

  const above = await commitmentModule.createAssessmentCommitment({
    score: 73,
    learnerId: LEARNER,
    attemptId: ATTEMPT,
    blinding: 42n,
  });
  commitment73 = above.publicCommitment.commitment;
  const proved73 = await snarkjs.groth16.fullProve({
    score: "73",
    blinding: "42",
    learnerId: commitmentModule.decimal(commitmentModule.uuidToField(LEARNER)),
    attemptId: commitmentModule.decimal(commitmentModule.uuidToField(ATTEMPT)),
    threshold: "60",
    commitment: commitment73,
  }, path.join(buildDir, "score_threshold.wasm"), path.join(buildDir, "score_threshold_final.zkey"));
  proof73 = proved73.proof;
  signals73 = [proved73.publicSignals[0], proved73.publicSignals[1]];

  const below = await commitmentModule.createAssessmentCommitment({
    score: 59,
    learnerId: LEARNER,
    attemptId: ATTEMPT,
    blinding: 42n,
  });
  await assert.rejects(() => snarkjs.groth16.fullProve({
    score: "59",
    blinding: "42",
    learnerId: commitmentModule.decimal(commitmentModule.uuidToField(LEARNER)),
    attemptId: commitmentModule.decimal(commitmentModule.uuidToField(ATTEMPT)),
    threshold: "60",
    commitment: below.publicCommitment.commitment,
  }, path.join(buildDir, "score_threshold.wasm"), path.join(buildDir, "score_threshold_final.zkey")));

  wrongKey = JSON.parse(readFileSync(
    path.join(path.dirname(buildDir), "score-threshold-v1-below", "verification_key.json"),
    "utf8",
  )) as object;
  let wrongAccepted = true;
  try {
    wrongAccepted = await snarkjs.groth16.verify(wrongKey, signals60, proof60);
  } catch {
    wrongAccepted = false;
  }
  if (wrongAccepted) throw new Error("A different verification key accepted the proof");
});

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

describe("recruiter-selected score requests", () => {
  it("accepts a real proof when the private score equals the requested threshold", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store, { ledger: ledger("disabled") });
    const request = await openRequest(dependencies, 60);
    const result = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.checks.mathematics, "valid");
    assert.equal(result.checks.signature, "valid");
    assert.equal(result.checks.document, "matches");
    assert.equal(result.checks.commitment, "matches");
    assert.equal(result.checks.threshold, "matches");
    assert.equal(result.checks.holder, "matches");
    assert.equal(result.checks.revocation, "active");
    assert.equal(result.checks.ledger, "unavailable");
    assert.equal(result.checks.request, "accepted");
    assert.match(result.message, /not a ledger confirmation/);
    assert.match(result.limitation, /not cryptographic freshness/);
    const packed = JSON.stringify(result);
    assert.equal(packed.includes("42"), false);
    assert.equal(packed.includes(LEARNER), false);
  });

  it("accepts a real proof when the private score is above the requested threshold", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store, { commitment: commitment73, ledger: ledger("disabled") });
    const request = await openRequest(dependencies, 60, commitment73);
    const result = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof73,
      publicSignals: signals73,
      dependencies,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.checks.mathematics, "valid");
    assert.equal(result.checks.ledger, "unavailable");
    const packed = JSON.stringify(result);
    assert.equal(packed.includes("73"), false);
    assert.equal(packed.includes("42"), false);
  });

  it("rejects a second submission of the same request", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    const request = await openRequest(dependencies);
    await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies,
    });
    const again = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies,
    });
    assert.equal(again.accepted, false);
    assert.equal(again.checks.request, "used");
  });

  it("rejects a different requested threshold and leaves the request open", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    const request = await openRequest(dependencies, 80);
    const result = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.checks.threshold, "mismatch");
    assert.equal((await store.getById(request.id))?.status, "open");
  });

  it("rejects a tampered proof, a swapped commitment, and a failed verifier", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    const tamperedRequest = await openRequest(dependencies);
    const broken = structuredClone(proof60) as { pi_a: string[] };
    broken.pi_a[0] = `${broken.pi_a[0].slice(0, -1)}${broken.pi_a[0].endsWith("1") ? "2" : "1"}`;
    const tampered = await submitScoreRequest({
      requestId: tamperedRequest.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: broken,
      publicSignals: signals60,
      dependencies,
    });
    assert.equal(tampered.accepted, false);
    assert.equal(tampered.checks.mathematics, "invalid");

    const other = await openRequest(dependencies);
    const swapped = await submitScoreRequest({
      requestId: other.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: [signals60[0], `${signals60[1].slice(0, -1)}${signals60[1].endsWith("1") ? "2" : "1"}`],
      dependencies,
    });
    assert.equal(swapped.checks.commitment, "mismatch");

    const belowDeps = deps(store, { verifyGroth16: async () => false });
    const below = await openRequest(belowDeps);
    const failed = await submitScoreRequest({
      requestId: below.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: belowDeps,
    });
    assert.equal(failed.checks.mathematics, "invalid");
    assert.equal(failed.accepted, false);

    const wrongKeyDeps = deps(store, { readVerificationKey: () => ({ key: wrongKey }) });
    const wrongKeyRequest = await openRequest(wrongKeyDeps);
    const wrongKeyResult = await submitScoreRequest({
      requestId: wrongKeyRequest.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: wrongKeyDeps,
    });
    assert.equal(wrongKeyResult.accepted, false);
    assert.equal(wrongKeyResult.checks.mathematics, "invalid");

    const rebound = deps(store);
    const reboundRequest = await openRequest(rebound);
    rebound.loadCredential = async () => credential("1");
    const reboundResult = await submitScoreRequest({
      requestId: reboundRequest.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: rebound,
    });
    assert.equal(reboundResult.accepted, false);
    assert.equal(reboundResult.checks.commitment, "mismatch");
  });

  it("rejects the wrong learner, an expired request, a revoked credential, and a bad signature", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    const request = await openRequest(dependencies);
    await assert.rejects(
      () => submitScoreRequest({
        requestId: request.id,
        learnerUserId: OTHER,
        circuitId: "score-threshold-v1",
        proof: proof60,
        publicSignals: signals60,
        dependencies,
      }),
      /not found/,
    );

    const expired = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: { ...dependencies, now: () => NOW + 25 * 60 * 60 * 1000 },
    });
    assert.equal(expired.checks.request, "expired");

      await assert.rejects(() => createScoreRequest({
      recruiterUserId: RECRUITER,
      learnerUserId: LEARNER,
      credential: credential(commitment60, { revoked_at: "2026-11-15T01:00:00.000Z" }),
      threshold: 60,
      shareToken: "share-token-1234567890",
      dependencies,
    }), /revoked/);
    const revokedDeps = deps(store);
    const revokedRequest = await openRequest(revokedDeps);
    revokedDeps.loadCredential = async () => credential(commitment60, { revoked_at: "2026-11-15T01:00:00.000Z" });
    const revoked = await submitScoreRequest({
      requestId: revokedRequest.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: revokedDeps,
    });
    assert.equal(revoked.checks.revocation, "revoked");
    assert.equal(revoked.accepted, false);

    const badSignature = deps(store);
    const signatureRequest = await openRequest(badSignature);
    badSignature.verifySignature = () => false;
    const rejected = await submitScoreRequest({
      requestId: signatureRequest.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: badSignature,
    });
    assert.equal(rejected.checks.signature, "invalid");
    assert.equal(rejected.accepted, false);
  });

  it("rejects a ledger hash mismatch and keeps an unavailable ledger separate from acceptance", async () => {
    const store = createMemoryScoreRequestStore();
    const mismatch = deps(store, { ledger: ledger({ exists: true, hashMatches: false, status: "active" }) });
    const request = await openRequest(mismatch);
    const result = await submitScoreRequest({
      requestId: request.id,
      learnerUserId: LEARNER,
      circuitId: "score-threshold-v1",
      proof: proof60,
      publicSignals: signals60,
      dependencies: mismatch,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.checks.ledger, "hash_mismatch");
    assert.equal(result.checks.mathematics, "valid");
  });

  it("refuses to create a request when the issuer signature does not check", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    dependencies.verifySignature = () => false;
    await assert.rejects(() => openRequest(dependencies), /signature/);
    assert.equal((await store.listForLearner(LEARNER)).length, 0);
  });

  it("does not list another recruiter's request", async () => {
    const store = createMemoryScoreRequestStore();
    const dependencies = deps(store);
    await openRequest(dependencies);
    assert.equal((await store.listForRecruiter(OTHER)).length, 0);
    assert.equal((await store.listForRecruiter(RECRUITER)).length, 1);
    assert.equal((await store.listForLearner(LEARNER))[0]?.audience, RECRUITER);
  });
});

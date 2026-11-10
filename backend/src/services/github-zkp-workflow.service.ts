/**
 * Trusted GitHub contribution proof workflow.
 *
 * Counts, learner ids, snapshot ids, and commitments used for proving
 * come from the service-role store. Request bodies cannot supply them.
 * A valid Groth16 proof does not by itself prove GitHub authenticity,
 * credential issuance, or a Fabric anchor.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";
import { createTrustedGitHubContributionSnapshot } from "./github-contribution-persistence.service";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof, type GitHubZkpVerificationResult } from "./github-zkp-verify.service";
import { readGroth16Proof } from "./zkp-verify";
import {
  createSupabaseGitHubZkpStore,
  type GitHubZkpStore,
  type StoredGitHubProof,
} from "./github-zkp-store";

export const GITHUB_CIRCUIT_ID = "github-contributions-v1";
export const GITHUB_EVIDENCE_KIND = "unique_verified_commit_shas";
const MAX_U32 = 4294967295;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPLAY_NOTE = "github-contributions-v1 binds the public threshold and the trusted snapshot commitment. It does not include a recruiter challenge, so a valid proof can be reused until the disclosure expires. Reuse does not reveal the private commit count.";

export const ZKP_TYPE_CATALOG = [
  {
    id: "score-threshold-v1",
    status: "implemented",
    claim: "A private assessment score is compared to the SIJIL policy threshold (meets or below) without revealing the exact score. Development-only trusted setup.",
    source: "Signed SIJIL assessment credential; backend-automated policy evaluation",
    publicInputs: ["threshold", "commitment"],
    privateInputs: ["score", "blinding", "learnerId", "attemptId"],
    setup: "development-only",
  },
  {
    id: GITHUB_CIRCUIT_ID,
    status: "implemented",
    claim: "A private count of unique verified authored commit SHAs in one named repository is compared to the SIJIL policy threshold of 70 (meets or below). Development-only trusted setup.",
    source: "GitHub commits API, with authorship checked against the connected GitHub user id; backend-automated policy evaluation",
    publicInputs: ["threshold", "commitment"],
    privateInputs: ["count", "blinding", "learnerId", "snapshotId"],
    setup: "development-only",
    evidenceKind: GITHUB_EVIDENCE_KIND,
  },
] as const;

export interface GitHubProofView {
  proofId: string;
  snapshotId: string;
  status: "ready";
  circuitId: typeof GITHUB_CIRCUIT_ID;
  evidenceKind: typeof GITHUB_EVIDENCE_KIND;
  threshold: string;
  commitment: string;
  repositoryFullName: string;
  githubUsername: string;
  verifiedAt: string;
  publicSignals: [string, string];
  proof: {
    protocol: "groth16";
    curve: "bn128";
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
  };
  trust: {
    groth16: "valid";
    githubAuthenticity: "checked_when_the_snapshot_was_created";
    credentialIssuance: "not_part_of_this_proof";
    fabricAnchor: "not_part_of_this_proof";
  };
  replay: string;
}

export interface GitHubVerificationView {
  verified: boolean;
  circuitId: typeof GITHUB_CIRCUIT_ID;
  evidenceKind: typeof GITHUB_EVIDENCE_KIND;
  claim: string;
  threshold: string | null;
  commitment: string | null;
  repositoryFullName: string | null;
  githubUsername: string | null;
  verifiedAt: string | null;
  message: string;
  replay: string;
  checks: {
    proof: "valid" | "invalid" | "malformed";
    commitment: "matches" | "mismatch" | "not_checked";
    snapshotOwnership: "matches" | "not_checked";
    githubAuthenticity: "checked_when_the_snapshot_was_created" | "not_established_by_this_proof";
    credentialIssuance: "not_part_of_this_proof";
    fabricAnchor: "not_part_of_this_proof";
  };
}

interface WorkflowDependencies {
  store: GitHubZkpStore;
  createSnapshot: typeof createTrustedGitHubContributionSnapshot;
  generateProof: typeof generateGitHubContributionProof;
  verifyProof: typeof verifyGitHubContributionProof;
  verifyOpening: (input: {
    count: number;
    learnerId: string;
    snapshotId: string;
    blinding: string;
    commitment: string;
  }) => Promise<boolean>;
}

let queueDepth = 0;
const MAX_QUEUE = 2;

export function resetGitHubProofQueueForTests(): void {
  queueDepth = 0;
}

async function withProofCapacity<T>(work: () => Promise<T>): Promise<T> {
  if (queueDepth >= MAX_QUEUE) {
    throw new AppError("Proof generation is busy. Try again shortly.", 429);
  }
  queueDepth += 1;
  try {
    return await work();
  } finally {
    queueDepth -= 1;
  }
}

function requireLearnerId(learnerId: string): void {
  if (!UUID.test(learnerId)) throw new AppError("Authentication required", 401);
}

function requireThreshold(threshold: number): void {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_U32) {
    throw new AppError("Threshold must be an integer from 0 through 4294967295", 400);
  }
}

function proofView(row: StoredGitHubProof, parsed: NonNullable<ReturnType<typeof readGroth16Proof>>): GitHubProofView {
  return {
    proofId: row.proofId,
    snapshotId: row.snapshotId,
    status: "ready",
    circuitId: GITHUB_CIRCUIT_ID,
    evidenceKind: GITHUB_EVIDENCE_KIND,
    threshold: String(row.threshold),
    commitment: row.commitment,
    repositoryFullName: row.repositoryFullName,
    githubUsername: row.githubUsername,
    verifiedAt: row.verifiedAt,
    publicSignals: [String(row.threshold), row.commitment],
    proof: parsed,
    trust: {
      groth16: "valid",
      githubAuthenticity: "checked_when_the_snapshot_was_created",
      credentialIssuance: "not_part_of_this_proof",
      fabricAnchor: "not_part_of_this_proof",
    },
    replay: REPLAY_NOTE,
  };
}

async function viewStoredProof(
  row: StoredGitHubProof,
  verifyProof: WorkflowDependencies["verifyProof"],
): Promise<GitHubProofView> {
  const parsed = readGroth16Proof(row.proof);
  if (!parsed) throw new AppError("Stored GitHub proof is malformed", 500);
  const decision = await verifyProof(
    {
      circuitId: GITHUB_CIRCUIT_ID,
      proof: parsed,
      publicSignals: [String(row.threshold), row.commitment],
    },
    row.commitment,
  );
  if (!decision.cryptographicallyValid) {
    throw new AppError("Stored GitHub proof failed verification", 500);
  }
  return proofView(row, parsed);
}

function verificationView(
  verified: boolean,
  proof: StoredGitHubProof | null,
  crypto: GitHubZkpVerificationResult | null,
): GitHubVerificationView {
  const threshold = proof ? String(proof.threshold) : crypto?.threshold ?? null;
  return {
    verified,
    circuitId: GITHUB_CIRCUIT_ID,
    evidenceKind: GITHUB_EVIDENCE_KIND,
    claim: threshold
      ? `At least ${threshold} unique verified commit SHAs in the named repository. This is not GitHub's contribution graph.`
      : "At least a public threshold of unique verified commit SHAs.",
    threshold,
    commitment: proof?.commitment ?? null,
    repositoryFullName: proof?.repositoryFullName ?? null,
    githubUsername: proof?.githubUsername ?? null,
    verifiedAt: proof?.verifiedAt ?? null,
    message: verified
      ? "The Groth16 proof matches the trusted snapshot commitment. GitHub authenticity was checked when that snapshot was created. This proof does not establish credential issuance or a Fabric anchor."
      : crypto?.reason || "GitHub contribution proof verification failed",
    replay: REPLAY_NOTE,
    checks: {
      proof: !crypto ? "malformed" : crypto.cryptographicallyValid ? "valid" : crypto.reason.includes("Malformed") ? "malformed" : "invalid",
      commitment: crypto?.reason === "Commitment does not match the trusted value"
        ? "mismatch"
        : crypto?.cryptographicallyValid ? "matches" : "not_checked",
      snapshotOwnership: proof ? "matches" : "not_checked",
      githubAuthenticity: verified
        ? "checked_when_the_snapshot_was_created"
        : "not_established_by_this_proof",
      credentialIssuance: "not_part_of_this_proof",
      fabricAnchor: "not_part_of_this_proof",
    },
  };
}

function defaultDependencies(): WorkflowDependencies {
  return {
    store: createSupabaseGitHubZkpStore(),
    createSnapshot: createTrustedGitHubContributionSnapshot,
    generateProof: generateGitHubContributionProof,
    verifyProof: verifyGitHubContributionProof,
    verifyOpening: async (input) => {
      const module = await loadGitHubCommitmentModule();
      return module.verifyGitHubOpening(input);
    },
  };
}

export const githubZkp = {
  async listTypes() {
    return {
      types: ZKP_TYPE_CATALOG,
      missingProductDecisions: "Only score-threshold-v1 and github-contributions-v1 are defined in this repository. Additional proof types are not implemented.",
    };
  },

  async listEvidence(learnerId: string, dependencies: WorkflowDependencies = defaultDependencies()) {
    requireLearnerId(learnerId);
    const [connection, snapshots] = await Promise.all([
      dependencies.store.githubConnected(learnerId),
      dependencies.store.listSnapshots(learnerId),
    ]);
    return {
      github: {
        connected: connection.connected,
        username: connection.username,
        evidenceKind: GITHUB_EVIDENCE_KIND,
        eligibleSnapshots: snapshots,
      },
    };
  },

  async createSnapshot(
    learnerId: string,
    repositoryFullName: string,
    dependencies: WorkflowDependencies = defaultDependencies(),
  ) {
    requireLearnerId(learnerId);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryFullName)) {
      throw new AppError("Repository must use owner/name form", 400);
    }
    try {
      const created = await dependencies.createSnapshot(learnerId, repositoryFullName);
      return {
        snapshotId: created.snapshotId,
        repositoryFullName: created.repositoryFullName,
        verifiedAt: created.verifiedAt,
        evidenceKind: GITHUB_EVIDENCE_KIND,
        commitment: created.commitment,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : "Could not create snapshot";
      const status = /not connected|does not match|Invalid|authentication failed|author does not match|pagination|API failed/i.test(message)
        ? 400
        : 503;
      const safe = /token|blinding|secret|authorization|bearer/i.test(message)
        ? "Could not create the trusted GitHub snapshot"
        : message;
      throw new AppError(status === 400 ? safe : "Could not create the trusted GitHub snapshot", status);
    }
  },

  async requestProof(
    learnerId: string,
    snapshotId: string,
    threshold: number,
    dependencies: WorkflowDependencies = defaultDependencies(),
  ): Promise<GitHubProofView> {
    requireLearnerId(learnerId);
    requireThreshold(threshold);
    if (!UUID.test(snapshotId)) throw new AppError("Snapshot was not found", 404);

    const snapshot = await dependencies.store.getSnapshot(snapshotId, learnerId);
    const opening = snapshot
      ? await dependencies.store.getOpening(snapshotId, learnerId)
      : null;
    if (!snapshot || !opening || opening.learnerId !== learnerId || opening.snapshotId !== snapshot.snapshotId) {
      throw new AppError("Snapshot was not found", 404);
    }

    const opens = await dependencies.verifyOpening({
      count: opening.contributionCount,
      learnerId,
      snapshotId,
      blinding: opening.blinding,
      commitment: snapshot.commitment,
    });
    if (!opens) throw new AppError("Trusted snapshot commitment does not match its opening", 500);

    const existing = await dependencies.store.findProof(snapshotId, learnerId, threshold);
    if (existing) return viewStoredProof(existing, dependencies.verifyProof);

    if (opening.contributionCount < threshold) {
      throw new AppError("The verified commit count does not meet that threshold", 400);
    }

    return withProofCapacity(async () => {
      let generated: { proof: unknown; publicSignals: string[] };
      try {
        generated = await dependencies.generateProof({
          count: opening.contributionCount,
          blinding: opening.blinding,
          learnerId,
          snapshotId,
          threshold,
          commitment: snapshot.commitment,
        });
      } catch {
        throw new AppError("Proof generation failed", 500);
      }

      const parsed = readGroth16Proof(generated.proof);
      if (!parsed || generated.publicSignals[0] !== String(threshold) || generated.publicSignals[1] !== snapshot.commitment) {
        throw new AppError("Proof generation failed", 500);
      }
      const decision = await dependencies.verifyProof(
        { circuitId: GITHUB_CIRCUIT_ID, proof: parsed, publicSignals: [String(threshold), snapshot.commitment] },
        snapshot.commitment,
      );
      if (!decision.cryptographicallyValid) throw new AppError("Proof generation failed", 500);

      const proofId = randomUUID();
      const inserted = await dependencies.store.insertProof({
        proofId,
        snapshotId,
        learnerId,
        threshold,
        proof: parsed,
        commitment: snapshot.commitment,
      });
      const stored = inserted === "created"
        ? {
          proofId,
          snapshotId,
          learnerId,
          threshold,
          commitment: snapshot.commitment,
          proof: parsed,
          repositoryFullName: snapshot.repositoryFullName,
          githubUsername: snapshot.githubUsername,
          verifiedAt: snapshot.verifiedAt,
          createdAt: new Date().toISOString(),
        }
        : await dependencies.store.findProof(snapshotId, learnerId, threshold);
      if (!stored) throw new AppError("Proof generation failed", 500);
      return proofView(stored, parsed);
    });
  },

  async getProof(
    learnerId: string,
    proofId: string,
    dependencies: WorkflowDependencies = defaultDependencies(),
  ): Promise<GitHubProofView> {
    requireLearnerId(learnerId);
    if (!UUID.test(proofId)) throw new AppError("Proof was not found", 404);
    const row = await dependencies.store.getProof(proofId, learnerId);
    if (!row) throw new AppError("Proof was not found", 404);
    return viewStoredProof(row, dependencies.verifyProof);
  },

  async createDisclosure(
    learnerId: string,
    proofId: string,
    dependencies: WorkflowDependencies = defaultDependencies(),
  ) {
    requireLearnerId(learnerId);
    const proof = await this.getProof(learnerId, proofId, dependencies);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await dependencies.store.insertDisclosure({
      disclosureId: randomUUID(),
      proofId: proof.proofId,
      learnerId,
      tokenHash,
      expiresAt,
    });
    return {
      disclosureToken: token,
      expiresAt,
      proofId: proof.proofId,
      claim: `At least ${proof.threshold} unique verified commit SHAs in ${proof.repositoryFullName}.`,
      circuitId: GITHUB_CIRCUIT_ID,
    };
  },

  async verifyDisclosure(
    disclosureToken: string,
    dependencies: WorkflowDependencies = defaultDependencies(),
  ): Promise<GitHubVerificationView> {
    if (typeof disclosureToken !== "string" || disclosureToken.length < 32 || disclosureToken.length > 128) {
      throw new AppError("Disclosure was not found", 404);
    }
    const tokenHash = createHash("sha256").update(disclosureToken).digest("hex");
    const disclosure = await dependencies.store.getDisclosureByTokenHash(tokenHash);
    if (!disclosure || Date.parse(disclosure.expiresAt) <= Date.now()) {
      throw new AppError("Disclosure was not found", 404);
    }
    if (disclosure.proof.learnerId !== disclosure.learnerId) {
      throw new AppError("Disclosure was not found", 404);
    }
    const parsed = readGroth16Proof(disclosure.proof.proof);
    if (!parsed) {
      return verificationView(false, disclosure.proof, {
        cryptographicallyValid: false,
        circuitId: GITHUB_CIRCUIT_ID,
        threshold: String(disclosure.proof.threshold),
        reason: "Malformed Groth16 proof",
      });
    }
    const decision = await dependencies.verifyProof(
      {
        circuitId: GITHUB_CIRCUIT_ID,
        proof: parsed,
        publicSignals: [String(disclosure.proof.threshold), disclosure.proof.commitment],
      },
      disclosure.proof.commitment,
    );
    return verificationView(decision.cryptographicallyValid, disclosure.proof, decision);
  },
};

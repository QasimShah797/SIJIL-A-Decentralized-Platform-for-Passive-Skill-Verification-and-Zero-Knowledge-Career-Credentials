/**
 * Backend-controlled GitHub policy evaluation.
 * Fixed threshold 70 per repository. Clients cannot choose thresholds.
 * Never logs openings, tokens, or private counts.
 */
import { AppError } from "../utils/AppError";
import { newDisclosure, reuseWithDisclosure } from "./assessment-zkp-automation.service";
import { createTrustedGitHubContributionSnapshot } from "./github-contribution-persistence.service";
import { loadGitHubCommitmentModule } from "./github-commitment-loader";
import { generateGitHubContributionProof } from "./github-zkp-proof.service";
import { verifyGitHubContributionProof } from "./github-zkp-verify.service";
import { readGroth16Proof } from "./zkp-verify";
import {
  createSupabaseGitHubZkpStore,
  type GitHubZkpStore,
} from "./github-zkp-store";
import {
  createSupabaseZkpPolicyStore,
  toPublicPolicyStatus,
  type ZkpPolicyStore,
  type ZkpPolicyVerificationRow,
} from "./zkp-policy-store";
import {
  GITHUB_POLICY_THRESHOLD,
  GITHUB_POLICY_VERSION,
  GITHUB_REUSE_WINDOW_MS,
  GITHUB_ZKP_TYPE,
  outcomeFromComparison,
  variantForOutcome,
} from "./zkp-policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
let queueDepth = 0;
const MAX_QUEUE = 2;

export function resetGitHubAutomationQueueForTests(): void {
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

export function githubEvidenceRef(repositoryFullName: string): string {
  return `repo:${repositoryFullName.trim().toLowerCase()}`;
}

function isOauthExpired(error: unknown): boolean {
  if (error instanceof AppError && error.statusCode === 401) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /GitHub authentication failed:\s*401|authorization expired|bad credentials|401/i.test(message);
}

function publicError(error: unknown): { code: string; message: string } {
  if (isOauthExpired(error)) {
    return { code: "github_oauth_expired", message: "GitHub authorization expired. Please reconnect GitHub." };
  }
  const message = error instanceof Error ? error.message : "GitHub policy evaluation failed";
  if (/not connected/i.test(message)) {
    return { code: "github_not_connected", message: "GitHub is not connected." };
  }
  if (/API failed:\s*(403|429)|rate limit/i.test(message)) {
    return { code: "github_rate_limited", message: "GitHub rate limit reached. SIJIL will retry later." };
  }
  if (/token|blinding|secret|authorization|bearer|opening/i.test(message)) {
    return { code: "evaluation_failed", message: "GitHub policy evaluation failed" };
  }
  return { code: "evaluation_failed", message: message.slice(0, 200) };
}

export interface GitHubAutomationDependencies {
  store: GitHubZkpStore;
  policyStore: ZkpPolicyStore;
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

function defaultDependencies(): GitHubAutomationDependencies {
  return {
    store: createSupabaseGitHubZkpStore(),
    policyStore: createSupabaseZkpPolicyStore(),
    createSnapshot: createTrustedGitHubContributionSnapshot,
    generateProof: generateGitHubContributionProof,
    verifyProof: verifyGitHubContributionProof,
    verifyOpening: async (input) => {
      const module = await loadGitHubCommitmentModule();
      return module.verifyGitHubOpening(input);
    },
  };
}

function commitmentString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "commitment" in value) {
    const nested = (value as { commitment?: unknown }).commitment;
    if (typeof nested === "string") return nested;
  }
  throw new Error("Trusted snapshot commitment is missing");
}

/** A verified row inside the reuse window is returned without calling GitHub or creating a snapshot. */
export function isReusable(existing: ZkpPolicyVerificationRow, now: number): boolean {
  if (existing.outcome !== "MEETS_THRESHOLD" && existing.outcome !== "BELOW_THRESHOLD") {
    return false;
  }
  if (!existing.proof || !Array.isArray(existing.publicSignals)) return false;
  if (existing.threshold !== GITHUB_POLICY_THRESHOLD) return false;
  const fresh = existing.evidenceFreshAt ? Date.parse(existing.evidenceFreshAt) : Number.NaN;
  return Number.isFinite(fresh) && now - fresh < GITHUB_REUSE_WINDOW_MS;
}

export interface GitHubEvaluateResult {
  status: ReturnType<typeof toPublicPolicyStatus>;
  disclosureToken: string | null;
  reused: boolean;
}

export async function evaluateGitHubPolicy(
  learnerId: string,
  repositoryFullName: string,
  dependencies: GitHubAutomationDependencies = defaultDependencies(),
  options: { issueDisclosure?: boolean; forceRefresh?: boolean; now?: number } = {},
): Promise<GitHubEvaluateResult> {
  const issueDisclosure = options.issueDisclosure ?? true;
  if (!UUID.test(learnerId)) throw new AppError("Authentication required", 401);
  if (!REPO.test(repositoryFullName)) {
    throw new AppError("Repository must use owner/name form", 400);
  }

  const evidenceRef = githubEvidenceRef(repositoryFullName);
  const availability = await dependencies.policyStore.checkAvailability();
  if (!availability.available) {
    throw new AppError(
      availability.reason === "missing_table"
        ? "ZKP policy table is not applied"
        : "Trusted ZKP policy records are unavailable",
      503,
    );
  }

  const existing = await dependencies.policyStore.getByEvidence(
    learnerId,
    GITHUB_ZKP_TYPE,
    GITHUB_POLICY_VERSION,
    evidenceRef,
  );
  if (existing && !options.forceRefresh && isReusable(existing, options.now ?? Date.now())) {
    return reuseWithDisclosure(existing, dependencies.policyStore, issueDisclosure);
  }

  try {
    return await withProofCapacity(async () => {
      const created = await dependencies.createSnapshot(learnerId, repositoryFullName);
      const commitment = commitmentString(created.commitment);
      const snapshotId = created.snapshotId;
      const freshAt = created.verifiedAt;

      const opening = await dependencies.store.getOpening(snapshotId, learnerId);
      if (!opening || opening.learnerId !== learnerId) {
        throw new AppError("Trusted snapshot opening is unavailable", 500);
      }

      const opens = await dependencies.verifyOpening({
        count: opening.contributionCount,
        learnerId,
        snapshotId,
        blinding: opening.blinding,
        commitment,
      });
      if (!opens) throw new AppError("Trusted snapshot commitment does not match its opening", 500);

      const outcome = outcomeFromComparison(opening.contributionCount, GITHUB_POLICY_THRESHOLD);
      const variant = variantForOutcome(outcome);

      let generated: { proof: unknown; publicSignals: string[] };
      try {
        generated = await dependencies.generateProof({
          count: opening.contributionCount,
          blinding: opening.blinding,
          learnerId,
          snapshotId,
          threshold: GITHUB_POLICY_THRESHOLD,
          commitment,
          variant,
        });
      } catch {
        throw new AppError("Proof generation failed", 500);
      }

      const parsed = readGroth16Proof(generated.proof);
      if (
        !parsed
        || generated.publicSignals[0] !== String(GITHUB_POLICY_THRESHOLD)
        || generated.publicSignals[1] !== commitment
      ) {
        throw new AppError("Proof generation failed", 500);
      }

      const decision = await dependencies.verifyProof(
        {
          circuitId: GITHUB_ZKP_TYPE,
          proof: parsed,
          publicSignals: [String(GITHUB_POLICY_THRESHOLD), commitment],
        },
        commitment,
        variant,
      );
      if (!decision.cryptographicallyValid) {
        throw new AppError("Proof generation failed", 500);
      }

      const disclosure = issueDisclosure ? newDisclosure() : null;

      const row = await dependencies.policyStore.upsert({
        learnerUserId: learnerId,
        zkpType: GITHUB_ZKP_TYPE,
        policyVersion: GITHUB_POLICY_VERSION,
        threshold: GITHUB_POLICY_THRESHOLD,
        outcome,
        circuitVariant: variant,
        evidenceRef,
        evidenceScope: {
          repositoryFullName: created.repositoryFullName,
          snapshotId,
        },
        evidenceFreshAt: freshAt,
        publicSignals: generated.publicSignals,
        proof: parsed,
        disclosureTokenHash: disclosure?.tokenHash ?? existing?.disclosureTokenHash ?? null,
        disclosureExpiresAt: disclosure?.expiresAt ?? existing?.disclosureExpiresAt ?? null,
        errorCode: null,
        errorMessage: null,
      });

      return {
        status: toPublicPolicyStatus(row),
        disclosureToken: disclosure?.token ?? null,
        reused: false,
      };
    });
  } catch (error) {
    if (error instanceof AppError && (error.statusCode === 429 || error.statusCode === 503 || error.statusCode === 400)) {
      throw error;
    }
    const mapped = publicError(error);
    try {
      const row = await dependencies.policyStore.upsert({
        learnerUserId: learnerId,
        zkpType: GITHUB_ZKP_TYPE,
        policyVersion: GITHUB_POLICY_VERSION,
        threshold: GITHUB_POLICY_THRESHOLD,
        outcome: "ERROR",
        circuitVariant: null,
        evidenceRef,
        evidenceScope: { repositoryFullName },
        evidenceFreshAt: null,
        publicSignals: null,
        proof: null,
        disclosureTokenHash: null,
        disclosureExpiresAt: null,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      });
      return {
        status: toPublicPolicyStatus(row),
        disclosureToken: null,
        reused: false,
      };
    } catch {
      if (mapped.code === "github_oauth_expired") {
        throw new AppError(mapped.message, 401);
      }
      throw new AppError(mapped.message, 500);
    }
  }
}

/** Retry a previously failed GitHub policy row without inventing evidence. */
export async function retryGitHubPolicyRow(
  row: ZkpPolicyVerificationRow,
  dependencies: GitHubAutomationDependencies = defaultDependencies(),
): Promise<GitHubEvaluateResult | null> {
  const scope = row.evidenceScope;
  const repositoryFullName = typeof scope.repositoryFullName === "string"
    ? scope.repositoryFullName
    : row.evidenceRef.replace(/^repo:/, "");
  if (!REPO.test(repositoryFullName)) return null;
  return evaluateGitHubPolicy(row.learnerUserId, repositoryFullName, dependencies, {
    issueDisclosure: false,
    forceRefresh: true,
  });
}

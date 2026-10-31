/**
 * Background worker for automated ZKP policy evaluation retries.
 * Patterned on the Fabric anchor worker (setInterval + single-flight tick).
 */
import {
  evaluateAssessmentPolicy,
  retryAssessmentPolicyRow,
  assessmentEvidenceRef,
} from "./assessment-zkp-automation.service";
import { retryGitHubPolicyRow } from "./github-zkp-automation.service";
import {
  createSupabaseZkpPolicyStore,
  type ZkpPolicyStore,
  type ZkpPolicyVerificationRow,
} from "./zkp-policy-store";
import {
  ASSESSMENT_POLICY_VERSION,
  ASSESSMENT_ZKP_TYPE,
  GITHUB_REFRESH_AFTER_MS,
  GITHUB_ZKP_TYPE,
  RETRY_BACKOFF_MS,
} from "./zkp-policy";
import { readAssessmentCommitment } from "./assessment-binding";
import {
  autoIssueWalletReadyCredentials,
  scanLinkedGitHubRepositories,
} from "./competency-automation.service";
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH = 5;

let timer: NodeJS.Timeout | undefined;
let tickRunning = false;
let storeOverride: ZkpPolicyStore | undefined;

export function setZkpAutomationStoreForTests(store: ZkpPolicyStore | undefined): void {
  storeOverride = store;
}

function policyStore(): ZkpPolicyStore {
  return storeOverride ?? createSupabaseZkpPolicyStore();
}

function intervalMs(): number {
  const raw = process.env.ZKP_AUTOMATION_INTERVAL_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function batchSize(): number {
  const raw = process.env.ZKP_AUTOMATION_BATCH_SIZE;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_BATCH;
}

export function startZkpAutomationWorker(): void {
  const ms = intervalMs();
  void runScheduledTick();
  timer = setInterval(() => {
    void runScheduledTick();
  }, ms);
  timer.unref?.();
  console.log(`[zkp-automation-worker] started intervalMs=${ms}`);
}

export function stopZkpAutomationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

async function runScheduledTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await processZkpAutomationBatch({ store: policyStore(), batchSize: batchSize() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick failed";
    if (!/opening|blinding|token|score|count/i.test(message)) {
      console.error("[zkp-automation-worker] tick failed:", message.slice(0, 200));
    } else {
      console.error("[zkp-automation-worker] tick failed");
    }
  } finally {
    tickRunning = false;
  }
}

export interface ZkpAutomationHandlers {
  retryGitHub: (row: ZkpPolicyVerificationRow) => Promise<unknown>;
  retryAssessment: (row: ZkpPolicyVerificationRow) => Promise<unknown>;
  scanNewAssessments: (store: ZkpPolicyStore, limit: number) => Promise<number>;
  autoIssueCredentials?: (limit: number) => Promise<number>;
  scanLinkedGitHub?: (store: ZkpPolicyStore, limit: number) => Promise<number>;
}

const defaultHandlers: ZkpAutomationHandlers = {
  autoIssueCredentials: (limit) => autoIssueWalletReadyCredentials(limit),
  scanLinkedGitHub: (store, limit) => scanLinkedGitHubRepositories(store, limit),
  retryGitHub: retryGitHubPolicyRow,
  retryAssessment: retryAssessmentPolicyRow,
  scanNewAssessments: enqueueNewAssessmentEvidence,
};

export async function processZkpAutomationBatch(options: {
  store: ZkpPolicyStore;
  batchSize: number;
  now?: number;
  handlers?: ZkpAutomationHandlers;
}): Promise<{ processed: number }> {
  const availability = await options.store.checkAvailability();
  if (!availability.available) return { processed: 0 };
  const now = options.now ?? Date.now();
  const handlers = options.handlers ?? defaultHandlers;

  let processed = 0;
  const retries = await options.store.listRetryCandidates(
    options.batchSize,
    new Date(now - RETRY_BACKOFF_MS).toISOString(),
  );
  for (const row of retries) {
    if (await processRow(row, handlers)) processed += 1;
  }

  let remaining = options.batchSize - processed;
  if (remaining > 0) {
    const stale = await options.store.listStaleGitHub(
      remaining,
      new Date(now - GITHUB_REFRESH_AFTER_MS).toISOString(),
    );
    for (const row of stale) {
      if (await processRow(row, handlers)) processed += 1;
    }
  }

  remaining = options.batchSize - processed;
  if (remaining > 0 && handlers.scanLinkedGitHub) {
    processed += await handlers.scanLinkedGitHub(options.store, remaining);
  }

  // Issuance runs before the assessment scan so new credentials get proofs in the same tick.
  if (handlers.autoIssueCredentials) {
    await handlers.autoIssueCredentials(options.batchSize);
  }

  remaining = options.batchSize - processed;
  if (remaining > 0) {
    processed += await handlers.scanNewAssessments(options.store, remaining);
  }

  return { processed };
}

async function processRow(row: ZkpPolicyVerificationRow, handlers: ZkpAutomationHandlers): Promise<boolean> {
  try {
    if (row.zkpType === GITHUB_ZKP_TYPE) {
      await handlers.retryGitHub(row);
      return true;
    }
    if (row.zkpType === ASSESSMENT_ZKP_TYPE) {
      await handlers.retryAssessment(row);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function enqueueNewAssessmentEvidence(store: ZkpPolicyStore, limit: number): Promise<number> {
  try {
    const { data, error } = await supabaseService.client
      .from("credentials")
      .select("id, credential_uri, user_id, credential_document, revoked_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, limit));

    if (error) {
      if (isMissingRelationError(error)) return 0;
      return 0;
    }

    let processed = 0;
    for (const credential of data ?? []) {
      if (processed >= limit) break;
      const userId = typeof credential.user_id === "string" ? credential.user_id : "";
      const credentialId = typeof credential.credential_uri === "string"
        ? credential.credential_uri
        : typeof credential.id === "string"
          ? credential.id
          : "";
      if (!userId || !credentialId) continue;

      const commitment = readAssessmentCommitment(credential.credential_document);
      if (commitment.status !== "ok") continue;

      const existing = await store.getByEvidence(
        userId,
        ASSESSMENT_ZKP_TYPE,
        ASSESSMENT_POLICY_VERSION,
        assessmentEvidenceRef(commitment.claim.attemptId),
      );
      // Existing rows (verified or erroring) are handled by the retry path with backoff.
      if (existing) continue;

      try {
        await evaluateAssessmentPolicy(userId, credentialId, undefined, { issueDisclosure: false });
        processed += 1;
      } catch {
        // Skip ineligible credentials; do not crash the worker.
      }
    }
    return processed;
  } catch {
    return 0;
  }
}

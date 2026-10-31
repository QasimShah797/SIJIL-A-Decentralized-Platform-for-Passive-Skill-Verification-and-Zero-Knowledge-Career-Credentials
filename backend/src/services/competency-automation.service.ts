/**
 * Backend-controlled passive verification after a competency is declared or evidence changes:
 * GitHub policy proofs for repositories linked to the competency, and credential issuance
 * once the existing issuance gate passes (issued credentials enter the Fabric anchor outbox).
 * Only repositories already linked to the skill are evaluated; unrelated repositories are never used.
 */
import { supabaseService } from "./supabase.service";
import { credentialsService } from "./credentials.service";
import { evaluateGitHubPolicy, githubEvidenceRef } from "./github-zkp-automation.service";
import type { ZkpPolicyStore } from "./zkp-policy-store";
import { GITHUB_POLICY_VERSION, GITHUB_ZKP_TYPE } from "./zkp-policy";
import { PIPELINE_STAGE } from "../constants/status";

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

type Row = Record<string, unknown>;

export interface CompetencyAutomationDeps {
  linkedRepositories: (userId: string, skillId?: string) => Promise<Array<{ userId: string; repo: string }>>;
  walletReadySkills: (limit: number) => Promise<Array<{ userId: string; skillId: string }>>;
  evaluateGitHub: (userId: string, repo: string) => Promise<unknown>;
  issueCredential: (userId: string, skillId: string) => Promise<unknown>;
}

function repoName(row: Row): string | null {
  const full = typeof row.full_name === "string" ? row.full_name.trim() : "";
  return REPO.test(full) ? full : null;
}

export async function linkedRepositories(userId: string, skillId?: string): Promise<Array<{ userId: string; repo: string }>> {
  const db = supabaseService.client;
  let direct = db.from("github_repos").select("id, user_id, full_name, linked_skill_id").not("linked_skill_id", "is", null);
  if (userId) direct = direct.eq("user_id", userId);
  if (skillId) direct = direct.eq("linked_skill_id", skillId);
  let links = db.from("github_repo_skill_links").select("github_repo_id, skill_id, user_id");
  if (userId) links = links.eq("user_id", userId);
  if (skillId) links = links.eq("skill_id", skillId);

  const [{ data: directRows }, { data: linkRows }] = await Promise.all([direct, links]);
  const found = new Map<string, { userId: string; repo: string }>();
  for (const row of (directRows ?? []) as Row[]) {
    const repo = repoName(row);
    if (repo && typeof row.user_id === "string") found.set(`${row.user_id}:${repo.toLowerCase()}`, { userId: row.user_id, repo });
  }
  const repoIds = ((linkRows ?? []) as Row[])
    .map((row) => row.github_repo_id)
    .filter((id): id is string => typeof id === "string");
  if (repoIds.length > 0) {
    let linkedQuery = db.from("github_repos").select("id, user_id, full_name").in("id", repoIds);
    if (userId) linkedQuery = linkedQuery.eq("user_id", userId);
    const { data: linkedRepos } = await linkedQuery;
    for (const row of (linkedRepos ?? []) as Row[]) {
      const repo = repoName(row);
      if (repo && typeof row.user_id === "string") found.set(`${row.user_id}:${repo.toLowerCase()}`, { userId: row.user_id, repo });
    }
  }
  return [...found.values()];
}

/** Live `declared_skills` exposes `created_at`, not `updated_at` (project nhzvtqpplfruzocframc). */
export const WALLET_READY_SKILLS_ORDER_COLUMN = "created_at" as const;

type WalletReadySkillsQueryResult = {
  data: unknown;
  error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null;
};

/** Narrow client surface so unit tests can mock the chain without a live Supabase session. */
export type WalletReadySkillsDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => PromiseLike<WalletReadySkillsQueryResult>;
        };
      };
    };
  };
};

/**
 * Lists wallet-ready competencies for the auto-issue worker.
 * Throws on Supabase errors so a failed scan is never treated as an empty success.
 */
export async function listWalletReadySkills(
  limit: number,
  db: WalletReadySkillsDb = supabaseService.client as unknown as WalletReadySkillsDb,
): Promise<Array<{ userId: string; skillId: string }>> {
  const { data, error } = await db
    .from("declared_skills")
    .select("id, user_id")
    .eq("pipeline_stage", PIPELINE_STAGE.WALLET_READY)
    .order(WALLET_READY_SKILLS_ORDER_COLUMN, { ascending: true })
    .limit(limit);

  if (error) {
    const message = error.message ?? "declared_skills wallet_ready scan failed";
    console.error("[competency-automation] walletReadySkills query failed", {
      table: "declared_skills",
      pipelineStage: PIPELINE_STAGE.WALLET_READY,
      orderBy: WALLET_READY_SKILLS_ORDER_COLUMN,
      code: error.code ?? null,
      hint: error.hint ?? null,
      message,
    });
    throw new Error(`walletReadySkills scan failed: ${message}`);
  }

  return ((data ?? []) as Row[])
    .filter((row) => typeof row.id === "string" && typeof row.user_id === "string")
    .map((row) => ({ userId: row.user_id as string, skillId: row.id as string }));
}

export const defaultCompetencyAutomationDeps: CompetencyAutomationDeps = {
  linkedRepositories,
  walletReadySkills: listWalletReadySkills,
  evaluateGitHub: (userId, repo) => evaluateGitHubPolicy(userId, repo, undefined, { issueDisclosure: false }),
  issueCredential: (userId, skillId) => credentialsService.issue(userId, { skillId }),
};

/** Runs for one learner competency; every step is idempotent and failures are recorded, not thrown. */
export async function runCompetencyAutomation(
  userId: string,
  skillId: string,
  deps: CompetencyAutomationDeps = defaultCompetencyAutomationDeps,
): Promise<{ evaluated: number; issued: boolean }> {
  let evaluated = 0;
  try {
    for (const { repo } of await deps.linkedRepositories(userId, skillId)) {
      try {
        await deps.evaluateGitHub(userId, repo);
        evaluated += 1;
      } catch {
        // Errors are persisted on the policy row and retried by the worker.
      }
    }
  } catch {
    // Missing GitHub tables or connection: nothing to evaluate yet.
  }
  let issued = false;
  try {
    await deps.issueCredential(userId, skillId);
    issued = true;
  } catch {
    // Issuance gate not met yet (stage, evidence trust tier, or holder DID).
  }
  return { evaluated, issued };
}

export function triggerCompetencyAutomation(userId: string, skillId: string): void {
  void runCompetencyAutomation(userId, skillId).catch(() => undefined);
}

/** Worker step: issue credentials for skills that reached the attested stage. */
export async function autoIssueWalletReadyCredentials(
  limit: number,
  deps: CompetencyAutomationDeps = defaultCompetencyAutomationDeps,
): Promise<number> {
  // Scan failures must propagate — do not treat a query error as an empty success.
  const ready = await deps.walletReadySkills(limit);
  let issued = 0;
  for (const { userId, skillId } of ready) {
    try {
      await deps.issueCredential(userId, skillId);
      issued += 1;
    } catch {
      // Gate not met; try again on a later tick.
    }
  }
  return issued;
}

/** Worker step: evaluate linked repositories that have no policy outcome yet. */
export async function scanLinkedGitHubRepositories(
  store: ZkpPolicyStore,
  limit: number,
  deps: CompetencyAutomationDeps = defaultCompetencyAutomationDeps,
): Promise<number> {
  let processed = 0;
  try {
    for (const { userId, repo } of await deps.linkedRepositories("")) {
      if (processed >= limit) break;
      const existing = await store.getByEvidence(userId, GITHUB_ZKP_TYPE, GITHUB_POLICY_VERSION, githubEvidenceRef(repo));
      if (existing) continue;
      try {
        await deps.evaluateGitHub(userId, repo);
      } catch {
        // Persisted as ERROR and retried with backoff.
      }
      processed += 1;
    }
  } catch {
    return processed;
  }
  return processed;
}

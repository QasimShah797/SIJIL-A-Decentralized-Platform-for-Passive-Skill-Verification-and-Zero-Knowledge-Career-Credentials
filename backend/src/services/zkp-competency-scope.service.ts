/**
 * Scopes policy outcomes to one declared competency (declared_skills.id) owned by the learner.
 * GitHub rows count only for repositories explicitly linked to that competency
 * (github_repos.linked_skill_id or github_repo_skill_links); never by name or commit volume.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import { linkedRepositories } from "./competency-automation.service";
import { githubEvidenceRef } from "./github-zkp-automation.service";
import { assessmentEvidenceRef } from "./assessment-zkp-automation.service";
import { findCredentialForLearnerCompetency } from "./credential-verify.service";
import { readAssessmentCommitment } from "./assessment-binding";
import { ASSESSMENT_ZKP_TYPE, GITHUB_ZKP_TYPE } from "./zkp-policy";
import type { ZkpPolicyVerificationRow } from "./zkp-policy-store";

export interface CompetencyScopeDeps {
  ownsCompetency: (userId: string, competencyId: string) => Promise<boolean>;
  linkedRepositories: (userId: string, competencyId: string) => Promise<string[]>;
  assessmentAttemptId: (userId: string, competencyId: string) => Promise<string | null>;
}

export const defaultCompetencyScopeDeps: CompetencyScopeDeps = {
  async ownsCompetency(userId, competencyId) {
    const { data, error } = await supabaseService.client
      .from("declared_skills")
      .select("id")
      .eq("id", competencyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new AppError("Could not load competency", 503);
    return Boolean(data);
  },
  async linkedRepositories(userId, competencyId) {
    return (await linkedRepositories(userId, competencyId))
      .filter((item) => item.userId === userId)
      .map((item) => item.repo);
  },
  async assessmentAttemptId(userId, competencyId) {
    const credential = await findCredentialForLearnerCompetency(userId, competencyId);
    const commitment = credential ? readAssessmentCommitment(credential.credential_document) : null;
    return commitment?.status === "ok" ? commitment.claim.attemptId : null;
  },
};

export interface CompetencyScope {
  githubRefs: Set<string>;
  assessmentRefs: Set<string>;
}

export async function resolveCompetencyScope(
  userId: string,
  competencyId: string,
  deps: CompetencyScopeDeps = defaultCompetencyScopeDeps,
): Promise<CompetencyScope> {
  // 404 (not 403) so another learner's competency IDs cannot be probed.
  if (!(await deps.ownsCompetency(userId, competencyId))) {
    throw new AppError("Competency not found", 404);
  }
  const [repos, attemptId] = await Promise.all([
    deps.linkedRepositories(userId, competencyId),
    deps.assessmentAttemptId(userId, competencyId),
  ]);
  return {
    githubRefs: new Set(repos.map(githubEvidenceRef)),
    assessmentRefs: new Set(attemptId ? [assessmentEvidenceRef(attemptId)] : []),
  };
}

export function filterRowsToScope(
  rows: ZkpPolicyVerificationRow[],
  userId: string,
  scope: CompetencyScope,
): ZkpPolicyVerificationRow[] {
  return rows.filter((row) => {
    if (row.learnerUserId !== userId) return false;
    if (row.zkpType === GITHUB_ZKP_TYPE) return scope.githubRefs.has(row.evidenceRef);
    if (row.zkpType === ASSESSMENT_ZKP_TYPE) return scope.assessmentRefs.has(row.evidenceRef);
    return false;
  });
}

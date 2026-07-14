/**

 * Evidence records — project evidence, multi-skill links, match reasons.

 */

import { supabaseService } from "./supabase.service";

import { skillsService } from "./skills.service";

import { AppError } from "../utils/AppError";

import {

  EVIDENCE_RECORD_STATUS,

  EVIDENCE_SOURCE,

  EVIDENCE_TYPE,

} from "../constants/evidence";

import { PIPELINE_STAGE, SKILL_STATUS } from "../constants/status";

import type {

  EvidenceRecordRow,

  EvidenceRecordView,

  LanguageBreakdown,

  ProjectEvidenceView,

  SkillLinkView,

} from "../types/github-evidence.types";

import { evaluateSkillProjectMatch, buildMatchReasonForSkill, type ProjectEvidenceInput } from "../utils/evidence-matching";
import { githubSyncService } from "./github-sync.service";
import {
  fetchDeclaredSkillRefs,
  filterProjectsForDeclaredSkills,
} from "../utils/skill-review-filter";



const UNMAPPED_STATUSES = [

  EVIDENCE_RECORD_STATUS.UNMAPPED,

  "Unmapped Evidence",

];



function parseBreakdown(row: Record<string, unknown>): LanguageBreakdown {

  const direct = row.language_breakdown;

  if (direct && typeof direct === "object" && !Array.isArray(direct)) {

    return direct as LanguageBreakdown;

  }

  const meta = row.metadata as Record<string, unknown> | undefined;

  const fromMeta = meta?.language_breakdown;

  if (fromMeta && typeof fromMeta === "object" && !Array.isArray(fromMeta)) {

    return fromMeta as LanguageBreakdown;

  }

  return {};

}



function recordToProjectInput(row: Record<string, unknown>): ProjectEvidenceInput {

  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};

  return {

    repositoryName: row.repository_name as string,

    repoFullName: (row.repo_full_name as string | null) ?? (metadata.full_name as string | null) ?? null,

    description: (row.description as string | null) ?? null,

    primaryLanguage: (row.language as string | null) ?? null,

    languageBreakdown: parseBreakdown(row),

    topics: Array.isArray(metadata.topics) ? (metadata.topics as string[]) : [],

    dependencies: Array.isArray(metadata.dependencies) ? (metadata.dependencies as string[]) : [],

    metadata,

  };

}



function rowToView(row: EvidenceRecordRow, skillLinks: SkillLinkView[] = []): EvidenceRecordView {

  const breakdown = parseBreakdown(row as unknown as Record<string, unknown>);

  return {

    id: row.id,

    source: row.source,

    evidenceType: row.evidence_type ?? EVIDENCE_TYPE.PROJECT,

    status: row.status,

    repositoryName: row.repository_name,

    repositoryUrl: row.repository_url,

    repoFullName: row.repo_full_name,

    description: row.description,

    language: row.language,

    languageBreakdown: breakdown,

    stars: row.stars,

    forks: row.forks,

    lastUpdated: row.last_updated,

    commitCount: row.commit_count,

    prSummary: row.pr_summary,

    syncDate: row.sync_date,

    suggestedSkillId: row.suggested_skill_id,

    suggestedSkillName: row.suggested_skill_name,

    mappedSkillId: row.mapped_skill_id,

    githubRepoId: row.github_repo_id,

    skillLinks,

    matchReason: skillLinks[0]?.matchReason ?? null,

  };

}



export class EvidenceRecordsService {

  private async loadSkillLinksForRecords(

    userId: string,

    evidenceIds: string[],

  ): Promise<Map<string, SkillLinkView[]>> {

    if (!evidenceIds.length) return new Map();



    const { data: links, error } = await supabaseService.client

      .from("skill_evidence_links")

      .select("skill_id, evidence_record_id, match_reason, linked_at, declared_skills(name)")

      .eq("user_id", userId)

      .in("evidence_record_id", evidenceIds);



    if (error) throw new AppError(error.message, 500);



    const map = new Map<string, SkillLinkView[]>();

    for (const link of links ?? []) {

      const evidenceId = link.evidence_record_id as string;

      const skillData = link.declared_skills as { name?: string } | null;

      const entry: SkillLinkView = {

        skillId: link.skill_id as string,

        skillName: skillData?.name ?? "",

        matchReason: (link.match_reason as string | null) ?? null,

        linkedAt: link.linked_at as string,

      };

      const list = map.get(evidenceId) ?? [];

      list.push(entry);

      map.set(evidenceId, list);

    }

    return map;

  }



  async listGitHubEvidence(userId: string): Promise<EvidenceRecordView[]> {

    const { data, error } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("user_id", userId)

      .eq("source", EVIDENCE_SOURCE.GITHUB)

      .neq("status", EVIDENCE_RECORD_STATUS.IGNORED)

      .order("last_updated", { ascending: false, nullsFirst: false });



    if (error) throw new AppError(error.message, 500);

    const rows = (data ?? []) as EvidenceRecordRow[];

    const linkMap = await this.loadSkillLinksForRecords(userId, rows.map((r) => r.id));

    return rows.map((r) => rowToView(r, linkMap.get(r.id) ?? []));

  }



  async listLinkedProjectEvidence(userId: string): Promise<ProjectEvidenceView[]> {

    const { data: links, error: linksErr } = await supabaseService.client

      .from("github_repo_skill_links")

      .select("github_repo_id, skill_id, match_reason, linked_at, declared_skills(name)")

      .eq("user_id", userId);



    if (linksErr) throw new AppError(linksErr.message, 500);

    let repoList: Array<Record<string, unknown>> = [];
    let linkList: Array<Record<string, unknown>> = links ?? [];

    if (linkList.length) {
      const repoIds = [...new Set(linkList.map((l) => l.github_repo_id as string))];
      const { data: repos, error: reposErr } = await supabaseService.client
        .from("github_repos")
        .select("*")
        .eq("user_id", userId)
        .in("id", repoIds)
        .order("last_updated", { ascending: false, nullsFirst: false });
      if (reposErr) throw new AppError(reposErr.message, 500);
      repoList = repos ?? [];
    } else {
      const { data: legacyRepos, error: reposErr } = await supabaseService.client
        .from("github_repos")
        .select("*")
        .eq("user_id", userId)
        .not("linked_skill_id", "is", null)
        .order("last_updated", { ascending: false, nullsFirst: false });
      if (reposErr) throw new AppError(reposErr.message, 500);
      repoList = legacyRepos ?? [];
      linkList = repoList.map((repo) => ({
        github_repo_id: repo.id,
        skill_id: repo.linked_skill_id,
        match_reason: null,
        linked_at: repo.linked_at,
        declared_skills: { name: repo.linked_skill_name },
      }));
    }

    if (!repoList.length) return [];

    const { data: evidenceRows } = await supabaseService.client
      .from("evidence_records")
      .select("id, github_repo_id, language_breakdown, metadata")
      .eq("user_id", userId)
      .in("github_repo_id", repoList.map((r) => r.repo_id as number));

    const evidenceByRepoId = new Map<number, { id: string; breakdown: LanguageBreakdown }>();
    for (const row of evidenceRows ?? []) {
      evidenceByRepoId.set(Number(row.github_repo_id), {
        id: row.id as string,
        breakdown: parseBreakdown(row as Record<string, unknown>),
      });
    }

    const needsBackfill = repoList
      .filter((repo) => {
        const repoBreakdown = parseBreakdown(repo);
        const ev = evidenceByRepoId.get(Number(repo.repo_id));
        return !Object.keys(repoBreakdown).length && !Object.keys(ev?.breakdown ?? {}).length;
      })
      .map((repo) => ({
        id: repo.id as string,
        repoId: repo.repo_id as number,
        fullName: repo.full_name as string,
      }));

    const backfilled = await githubSyncService.backfillLanguageBreakdownForRepos(userId, needsBackfill);

    const linksByRepo = new Map<string, SkillLinkView[]>();
    for (const link of linkList) {

      const repoUuid = link.github_repo_id as string;

      const skillData = link.declared_skills as { name?: string } | null;

      const entry: SkillLinkView = {

        skillId: link.skill_id as string,

        skillName: skillData?.name ?? "",

        matchReason: (link.match_reason as string | null) ?? null,

        linkedAt: link.linked_at as string,

      };

      const list = linksByRepo.get(repoUuid) ?? [];

      list.push(entry);

      linksByRepo.set(repoUuid, list);

    }



    const projects = repoList.map((repo) => {

      const repoUuid = repo.id as string;

      const repoIdNum = Number(repo.repo_id);

      const ev = evidenceByRepoId.get(repoIdNum);

      let breakdown = parseBreakdown(repo);

      if (!Object.keys(breakdown).length) breakdown = ev?.breakdown ?? {};

      if (!Object.keys(breakdown).length) breakdown = backfilled.get(repoUuid) ?? {};

      const topics = Array.isArray(repo.topics) ? (repo.topics as string[]) : [];

      const skillLinks = (linksByRepo.get(repoUuid) ?? []).map((link) => ({

        ...link,

        matchReason: link.matchReason ?? buildMatchReasonForSkill(link.skillName, breakdown),

      }));

      return {

        repoId: repoUuid,

        githubRepoId: repoIdNum,

        repositoryName: repo.repo_name as string,

        repoFullName: repo.full_name as string,

        repositoryUrl: repo.github_url as string,

        description: (repo.description as string | null) ?? null,

        primaryLanguage: (repo.primary_language as string | null) ?? null,

        languageBreakdown: breakdown,

        topics,

        lastUpdated: (repo.last_updated as string | null) ?? null,

        commitCount: repo.commit_count != null ? Number(repo.commit_count) : null,

        evidenceRecordId: ev?.id ?? "",

        skillLinks,

      };

    });

    const skillRefs = await fetchDeclaredSkillRefs(userId);
    return filterProjectsForDeclaredSkills(projects, skillRefs);

  }



  async listUnmapped(userId: string): Promise<EvidenceRecordView[]> {

    const { data, error } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("user_id", userId)

      .in("status", UNMAPPED_STATUSES)

      .order("last_updated", { ascending: false, nullsFirst: false });



    if (error) throw new AppError(error.message, 500);

    return (data ?? []).map((r) => rowToView(r as EvidenceRecordRow, []));

  }



  private async refreshEvidenceLinkStatus(userId: string, evidenceId: string): Promise<void> {

    const { data: remaining } = await supabaseService.client

      .from("skill_evidence_links")

      .select("id")

      .eq("user_id", userId)

      .eq("evidence_record_id", evidenceId)

      .limit(1);



    await supabaseService.client

      .from("evidence_records")

      .update({

        status: remaining?.length ? EVIDENCE_RECORD_STATUS.PROJECT : EVIDENCE_RECORD_STATUS.UNMAPPED,

        updated_at: new Date().toISOString(),

      })

      .eq("id", evidenceId)

      .eq("user_id", userId);

  }



  private async refreshSkillEvidenceStatus(userId: string, skillId: string): Promise<void> {

    const { data: remaining } = await supabaseService.client

      .from("skill_evidence_links")

      .select("id")

      .eq("user_id", userId)

      .eq("skill_id", skillId)

      .limit(1);



    if (remaining?.length) {

      await supabaseService.client

        .from("declared_skills")

        .update({

          status: SKILL_STATUS.EVIDENCE_LINKED,

          pipeline_stage: PIPELINE_STAGE.EVIDENCE_LINKED,

          last_related_activity_at: new Date().toISOString(),

          updated_at: new Date().toISOString(),

        })

        .eq("user_id", userId)

        .eq("id", skillId);

    } else {

      await supabaseService.client

        .from("declared_skills")

        .update({

          status: SKILL_STATUS.CLAIMED,

          pipeline_stage: PIPELINE_STAGE.DECLARED,

          updated_at: new Date().toISOString(),

        })

        .eq("user_id", userId)

        .eq("id", skillId);

    }

  }



  async linkToSkill(

    userId: string,

    skillId: string,

    evidenceId: string,

    matchOverride?: { matchReason: string; matchSignals: Record<string, unknown> },

  ): Promise<EvidenceRecordView> {

    const skill = await skillsService.getById(userId, skillId);



    const { data: record, error: fetchErr } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("user_id", userId)

      .eq("id", evidenceId)

      .maybeSingle();



    if (fetchErr) throw new AppError(fetchErr.message, 500);

    if (!record) throw new AppError("Evidence record not found", 404);

    if (record.status === EVIDENCE_RECORD_STATUS.IGNORED) {

      throw new AppError("Ignored evidence cannot be linked", 400);

    }



    const evaluation = matchOverride ?? (() => {

      const result = evaluateSkillProjectMatch(skill, recordToProjectInput(record));

      return {

        matchReason: result.reasons[0] ?? `Matched because this project contains evidence related to ${skill.name}.`,

        matchSignals: result.signals,

      };

    })();



    const { data: existingLink } = await supabaseService.client

      .from("skill_evidence_links")

      .select("id")

      .eq("skill_id", skillId)

      .eq("evidence_record_id", evidenceId)

      .maybeSingle();



    if (!existingLink) {

      await supabaseService.client.from("skill_evidence_links").insert({

        user_id: userId,

        skill_id: skillId,

        evidence_record_id: evidenceId,

        match_reason: evaluation.matchReason,

        match_signals: evaluation.matchSignals,

        linked_at: new Date().toISOString(),

      });

    }



    const { data: updated, error: updateErr } = await supabaseService.client

      .from("evidence_records")

      .update({

        status: EVIDENCE_RECORD_STATUS.PROJECT,

        evidence_type: EVIDENCE_TYPE.PROJECT,

        updated_at: new Date().toISOString(),

      })

      .eq("id", evidenceId)

      .eq("user_id", userId)

      .select("*")

      .single();



    if (updateErr) throw new AppError(updateErr.message, 500);



    if (record.github_repo_id) {

      const { data: ghRepo } = await supabaseService.client

        .from("github_repos")

        .select("id")

        .eq("user_id", userId)

        .eq("repo_id", record.github_repo_id)

        .maybeSingle();



      if (ghRepo?.id) {

        await supabaseService.client.from("github_repo_skill_links").upsert(

          {

            user_id: userId,

            github_repo_id: ghRepo.id,

            skill_id: skillId,

            evidence_record_id: evidenceId,

            match_reason: evaluation.matchReason,

            linked_at: new Date().toISOString(),

          },

          { onConflict: "github_repo_id,skill_id" },

        );



        await supabaseService.client

          .from("github_repos")

          .update({

            linked_skill_id: skillId,

            linked_skill_name: skill.name,

            linked_at: new Date().toISOString(),

          })

          .eq("user_id", userId)

          .eq("id", ghRepo.id);

      }

    }



    await this.refreshSkillEvidenceStatus(userId, skillId);



    await supabaseService.client.from("supporting_records").insert({

      user_id: userId,

      skill_id: skillId,

      source: EVIDENCE_SOURCE.GITHUB,

      title: record.repository_name as string,

      url: record.repository_url as string,

      occurred_at: record.last_updated ?? new Date().toISOString(),

    });



    const linkMap = await this.loadSkillLinksForRecords(userId, [evidenceId]);

    return rowToView(updated as EvidenceRecordRow, linkMap.get(evidenceId) ?? []);

  }



  async autoLinkStrongMatchesForSkill(userId: string, skillId: string): Promise<number> {

    const skill = await skillsService.getById(userId, skillId);



    const { data: records, error } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("user_id", userId)

      .eq("source", EVIDENCE_SOURCE.GITHUB)

      .neq("status", EVIDENCE_RECORD_STATUS.IGNORED);



    if (error) throw new AppError(error.message, 500);



    const { data: existingLinks } = await supabaseService.client

      .from("skill_evidence_links")

      .select("evidence_record_id")

      .eq("user_id", userId)

      .eq("skill_id", skillId);



    const linkedEvidenceIds = new Set(

      (existingLinks ?? []).map((l) => l.evidence_record_id as string),

    );



    let linkedCount = 0;

    for (const record of records ?? []) {

      if (linkedEvidenceIds.has(record.id as string)) continue;



      const result = evaluateSkillProjectMatch(skill, recordToProjectInput(record));

      if (result.confidence !== "high" || !result.reasons.length) continue;



      await this.linkToSkill(userId, skillId, record.id as string, {

        matchReason: result.reasons[0],

        matchSignals: result.signals,

      });

      linkedCount += 1;

    }



    return linkedCount;

  }



  async autoLinkStrongMatchesForAllSkills(userId: string): Promise<number> {

    const { data: skills, error } = await supabaseService.client

      .from("declared_skills")

      .select("id")

      .eq("user_id", userId);



    if (error) throw new AppError(error.message, 500);



    let total = 0;

    for (const skill of skills ?? []) {

      total += await this.autoLinkStrongMatchesForSkill(userId, skill.id as string);

    }

    return total;

  }



  async unlinkFromSkill(

    userId: string,

    skillId: string,

    evidenceId: string,

  ): Promise<EvidenceRecordView> {

    const { data: record, error: fetchErr } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("user_id", userId)

      .eq("id", evidenceId)

      .maybeSingle();



    if (fetchErr) throw new AppError(fetchErr.message, 500);

    if (!record) throw new AppError("Evidence record not found", 404);



    await supabaseService.client

      .from("skill_evidence_links")

      .delete()

      .eq("skill_id", skillId)

      .eq("evidence_record_id", evidenceId);



    if (record.github_repo_id) {

      const { data: ghRepo } = await supabaseService.client

        .from("github_repos")

        .select("id, linked_skill_id")

        .eq("user_id", userId)

        .eq("repo_id", record.github_repo_id)

        .maybeSingle();



      if (ghRepo?.id) {

        await supabaseService.client

          .from("github_repo_skill_links")

          .delete()

          .eq("github_repo_id", ghRepo.id)

          .eq("skill_id", skillId);



        const { data: otherLinks } = await supabaseService.client

          .from("github_repo_skill_links")

          .select("skill_id, declared_skills(name)")

          .eq("github_repo_id", ghRepo.id)

          .limit(1);



        if (otherLinks?.length) {

          const next = otherLinks[0];

          const nextSkill = next.declared_skills as { name?: string } | null;

          await supabaseService.client

            .from("github_repos")

            .update({

              linked_skill_id: next.skill_id as string,

              linked_skill_name: nextSkill?.name ?? null,

            })

            .eq("id", ghRepo.id);

        } else {

          await supabaseService.client

            .from("github_repos")

            .update({

              linked_skill_id: null,

              linked_skill_name: null,

              linked_at: null,

            })

            .eq("id", ghRepo.id);

        }

      }

    }



    await this.refreshEvidenceLinkStatus(userId, evidenceId);

    await this.refreshSkillEvidenceStatus(userId, skillId);



    const { data: updated } = await supabaseService.client

      .from("evidence_records")

      .select("*")

      .eq("id", evidenceId)

      .maybeSingle();



    const linkMap = await this.loadSkillLinksForRecords(userId, [evidenceId]);

    return rowToView(updated as EvidenceRecordRow, linkMap.get(evidenceId) ?? []);

  }



  async unlinkByRepoId(userId: string, repoId: string, skillId?: string): Promise<void> {

    const { data: repo } = await supabaseService.client

      .from("github_repos")

      .select("id, repo_id, linked_skill_id")

      .eq("user_id", userId)

      .eq("id", repoId)

      .maybeSingle();



    if (!repo) return;



    const targetSkillId = skillId ?? (repo.linked_skill_id as string | null);

    if (!targetSkillId) {

      await supabaseService.client

        .from("github_repos")

        .update({ linked_skill_id: null, linked_skill_name: null, linked_at: null })

        .eq("id", repoId);

      return;

    }



    const { data: record } = await supabaseService.client

      .from("evidence_records")

      .select("id")

      .eq("user_id", userId)

      .eq("github_repo_id", repo.repo_id)

      .maybeSingle();



    if (record?.id) {

      await this.unlinkFromSkill(userId, targetSkillId, record.id as string);

    } else {

      await supabaseService.client

        .from("github_repo_skill_links")

        .delete()

        .eq("github_repo_id", repo.id)

        .eq("skill_id", targetSkillId);

      await this.refreshSkillEvidenceStatus(userId, targetSkillId);

    }

  }



  async ignore(userId: string, evidenceId: string): Promise<EvidenceRecordView> {

    const { data, error } = await supabaseService.client

      .from("evidence_records")

      .update({

        status: EVIDENCE_RECORD_STATUS.IGNORED,

        updated_at: new Date().toISOString(),

      })

      .eq("user_id", userId)

      .eq("id", evidenceId)

      .select("*")

      .maybeSingle();



    if (error) throw new AppError(error.message, 500);

    if (!data) throw new AppError("Evidence record not found", 404);

    return rowToView(data as EvidenceRecordRow, []);

  }

}



export const evidenceRecordsService = new EvidenceRecordsService();



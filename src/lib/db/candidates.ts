import { supabase } from "@/integrations/supabase/client";
import { fetchAllLearnerProfiles } from "@/lib/db/learner-profile";
import { fetchDeclaredSkillsForUsers } from "@/lib/db/skills";
import { fetchCredentialsForUsers } from "@/lib/db/credentials";
import { fetchPeerReviewsForUsers } from "@/lib/db/peer-reviews";
import type { CandidateSkill } from "@/lib/sijil-data";

export type CandidateView = {
  id: string;
  name: string;
  topSkill: string;
  evidence: number;
  reviews: number;
  attestation: "Approved" | "Partial" | "Pending";
  institution: string;
  credentialCount: number;
};

function attestationFromCredentials(creds: { attestation: string }[]): "Approved" | "Partial" | "Pending" {
  if (!creds.length) return "Pending";
  const approved = creds.filter((c) => c.attestation === "Approved").length;
  if (approved === creds.length) return "Approved";
  if (approved > 0) return "Partial";
  return "Pending";
}

export async function fetchCandidates(): Promise<CandidateView[]> {
  const profiles = await fetchAllLearnerProfiles();
  if (!profiles.length) return [];

  const userIds = profiles.map((p) => p.user_id);
  const [skillsMap, credsMap, reviewsMap] = await Promise.all([
    fetchDeclaredSkillsForUsers(userIds),
    fetchCredentialsForUsers(userIds),
    fetchPeerReviewsForUsers(userIds),
  ]);

  return profiles.map((p) => {
    const skills = skillsMap[p.user_id] ?? [];
    const creds = credsMap[p.user_id] ?? [];
    const reviews = reviewsMap[p.user_id] ?? [];
    const topSkill = skills[0]?.name ?? creds[0]?.skill ?? "—";
    const evidence = skills.reduce((n, s) => n + (s.lastRelatedActivityAt ? 1 : 0), 0)
      + creds.reduce((n, c) => n + c.supportingRecords, 0);

    return {
      id: p.user_id,
      name: p.name,
      topSkill,
      evidence,
      reviews: reviews.length,
      attestation: attestationFromCredentials(creds),
      institution: p.institution,
      credentialCount: creds.length,
    };
  });
}

export async function fetchCandidateSkillsMap(): Promise<Record<string, CandidateSkill[]>> {
  const profiles = await fetchAllLearnerProfiles();
  const userIds = profiles.map((p) => p.user_id);
  const [skillsMap, credsMap, reviewsMap] = await Promise.all([
    fetchDeclaredSkillsForUsers(userIds),
    fetchCredentialsForUsers(userIds),
    fetchPeerReviewsForUsers(userIds),
  ]);

  const result: Record<string, CandidateSkill[]> = {};
  for (const p of profiles) {
    const skills = skillsMap[p.user_id] ?? [];
    const creds = credsMap[p.user_id] ?? [];
    const reviews = reviewsMap[p.user_id] ?? [];

    result[p.user_id] = skills.map((s) => {
      const skillCreds = creds.filter((c) => c.skill.includes(s.name));
      const skillReviews = reviews.filter((r) => r.skill === s.name);
      return {
        skill: s.name,
        domain: s.domain,
        evidence: skillCreds.reduce((n, c) => n + c.supportingRecords, 0) + (s.lastRelatedActivityAt ? 1 : 0),
        reviews: skillReviews.length,
        lmsRecords: 0,
        githubRecords: s.lastRelatedActivityAt ? 1 : 0,
        practicalTask: "—" as const,
        externalCert: "—" as const,
        attestation: skillCreds.some((c) => c.attestation === "Approved") ? "Approved" as const : "Pending" as const,
        attestationSource: p.institution,
        attestationDid: `did:web:issuer.${p.institution.toLowerCase().replace(/\s+/g, "")}.edu.pk`,
        credentialId: skillCreds[0]?.id ?? null,
      };
    });
  }
  return result;
}

export async function fetchCandidateById(id: string): Promise<CandidateView | null> {
  const all = await fetchCandidates();
  return all.find((c) => c.id === id) ?? null;
}

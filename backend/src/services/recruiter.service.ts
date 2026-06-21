/**
 * Recruiter verification, candidate lookup, and search with selective disclosure.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";
import { CredentialView } from "../types/credentials.types";
import { credentialsService } from "./credentials.service";

export interface CandidateView {
  id: string;
  name: string;
  topSkill: string;
  evidence: number;
  reviews: number;
  attestation: "Approved" | "Partial" | "Pending";
  institution: string;
  credentialCount: number;
}

export interface VerifyCredentialResult {
  credential: Partial<CredentialView>;
  disclosedFields: { id: string; label: string; value: string }[];
  presentationStatus: "Active" | "Expired" | "Revoked";
  candidateId?: string;
}

export class RecruiterService {
  async verifyCredential(credentialId: string): Promise<VerifyCredentialResult> {
    const { data: presentation } = await supabaseService.client
      .from("presentations")
      .select(`
        *,
        credentials ( credential_uri, name, issuer_name, issuer_did, holder_did, valid_from, verification_status, attestation_status, supporting_records, skill_name, proof, credential_types )
      `)
      .eq("token", credentialId)
      .maybeSingle();

    if (presentation) {
      const isExpired = new Date(presentation.expires_at as string).getTime() < Date.now();
      const status = presentation.revoked
        ? "Revoked"
        : isExpired
          ? "Expired"
          : "Active";

      const cred = presentation.credentials as Record<string, unknown> | null;
      const disclosed = (presentation.disclosed_fields as { id: string; label: string; value: string }[]) ?? [];

      const partialCredential: Partial<CredentialView> = {};
      for (const field of disclosed) {
        switch (field.id) {
          case "credentialName":
            partialCredential.name = field.value;
            break;
          case "skill":
            partialCredential.skill = field.value;
            break;
          case "issuer":
            partialCredential.issuer = field.value;
            break;
          case "validFrom":
            partialCredential.validFrom = field.value;
            break;
          case "holderDid":
            partialCredential.holderDid = field.value;
            break;
          case "issuerDid":
            partialCredential.issuerDid = field.value;
            break;
          default:
            break;
        }
      }

      if (cred) {
        partialCredential.id = cred.credential_uri as string;
        partialCredential.verification = cred.verification_status as string;
        partialCredential.attestation = cred.attestation_status as string;
      }

      return {
        credential: partialCredential,
        disclosedFields: disclosed,
        presentationStatus: status,
        candidateId: presentation.candidate_user_id as string,
      };
    }

    const full = await credentialsService.getByUri(credentialId);
    return {
      credential: {
        id: full.id,
        name: full.name,
        skill: full.skill,
        issuer: full.issuer,
        validFrom: full.validFrom,
        verification: full.verification,
        attestation: full.attestation,
      },
      disclosedFields: [],
      presentationStatus: "Active",
    };
  }

  async getCandidate(candidateId: string): Promise<CandidateView | null> {
    const candidates = await this.search({});
    return candidates.find((c) => c.id === candidateId) ?? null;
  }

  async search(query: { q?: string; skill?: string; institution?: string }): Promise<CandidateView[]> {
    const { data: profiles, error } = await supabaseService.client
      .from("learner_profiles")
      .select("user_id, first_name, last_name, institution_name");

    if (error) throw new AppError(error.message, 500);
    if (!profiles?.length) return [];

    const userIds = profiles.map((p) => p.user_id as string);

    const [{ data: skills }, { data: creds }, { data: reviews }] = await Promise.all([
      supabaseService.client.from("declared_skills").select("*").in("user_id", userIds),
      supabaseService.client.from("credentials").select("*").in("user_id", userIds),
      supabaseService.client.from("peer_reviews").select("*").in("learner_user_id", userIds),
    ]);

    const skillsByUser: Record<string, typeof skills> = {};
    for (const s of skills ?? []) {
      const uid = s.user_id as string;
      if (!skillsByUser[uid]) skillsByUser[uid] = [];
      skillsByUser[uid]!.push(s);
    }

    const credsByUser: Record<string, typeof creds> = {};
    for (const c of creds ?? []) {
      const uid = c.user_id as string;
      if (!credsByUser[uid]) credsByUser[uid] = [];
      credsByUser[uid]!.push(c);
    }

    const reviewsByUser: Record<string, typeof reviews> = {};
    for (const r of reviews ?? []) {
      const uid = r.learner_user_id as string;
      if (!reviewsByUser[uid]) reviewsByUser[uid] = [];
      reviewsByUser[uid]!.push(r);
    }

    let results: CandidateView[] = profiles.map((p) => {
      const uid = p.user_id as string;
      const userSkills = skillsByUser[uid] ?? [];
      const userCreds = credsByUser[uid] ?? [];
      const userReviews = reviewsByUser[uid] ?? [];
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Learner";
      const topSkill = userSkills[0]?.name ?? userCreds[0]?.skill_name ?? "—";
      const evidence =
        userSkills.reduce((n, s) => n + (s.last_related_activity_at ? 1 : 0), 0) +
        userCreds.reduce((n, c) => n + ((c.supporting_records as number) ?? 0), 0);

      const approved = userCreds.filter((c) => c.attestation_status === "Approved").length;
      let attestation: CandidateView["attestation"] = "Pending";
      if (userCreds.length) {
        attestation = approved === userCreds.length ? "Approved" : approved > 0 ? "Partial" : "Pending";
      }

      return {
        id: uid,
        name,
        topSkill,
        evidence,
        reviews: userReviews.length,
        attestation,
        institution: (p.institution_name as string) ?? "—",
        credentialCount: userCreds.length,
      };
    });

    const q = query.q?.trim().toLowerCase();
    if (q) {
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.topSkill.toLowerCase().includes(q) ||
          c.institution.toLowerCase().includes(q),
      );
    }

    if (query.institution) {
      const inst = query.institution.toLowerCase();
      results = results.filter((c) => c.institution.toLowerCase().includes(inst));
    }

    if (query.skill) {
      const skillQ = query.skill.toLowerCase();
      results = results.filter((c) => c.topSkill.toLowerCase().includes(skillQ));
    }

    return results;
  }
}

export const recruiterService = new RecruiterService();

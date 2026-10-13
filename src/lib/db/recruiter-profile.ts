import { supabase } from "@/integrations/supabase/client";
import { uploadLearnerAvatar } from "@/lib/db/learner-profile";
import type { Database } from "@/integrations/supabase/types";

export type RecruiterVerificationStatus = Database["public"]["Enums"]["recruiter_status"];

export type RecruiterProfileView = {
  userId: string;
  fullName: string;
  workEmail: string;
  companyName: string;
  jobTitle: string;
  companyWebsite: string | null;
  linkedinUrl: string | null;
  contactNumber: string | null;
  reason: string | null;
  verificationStatus: RecruiterVerificationStatus;
  verifiedAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
  initials: string;
};

export type RecruiterEditableProfile = {
  contactNumber: string;
  jobTitle: string;
  companyName: string;
  companyWebsite: string | null;
  linkedinUrl: string | null;
  reason: string | null;
  avatarUrl?: string;
};

const VERIFICATION_LABELS: Record<RecruiterVerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  work_email_verified: "Work email verified",
  limited: "Limited access",
  company_domain_verified: "Company verified",
};

export function recruiterVerificationLabel(status: RecruiterVerificationStatus) {
  return VERIFICATION_LABELS[status] ?? status;
}

export function recruiterInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "RC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function hiringFocusTags(reason: string | null, jobTitle: string) {
  const parts = (reason ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 40);
  if (parts.length > 0) return parts.slice(0, 12);
  const title = jobTitle.trim();
  return title ? [title] : [];
}

export function normalizeOptionalWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid company website URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter a valid company website URL.");
  }
  return parsed.toString();
}

export async function fetchRecruiterProfileView(userId: string): Promise<RecruiterProfileView | null> {
  const [recruiterResult, accountResult] = await Promise.all([
    supabase
      .from("recruiter_profiles")
      .select(
        "user_id, full_name, work_email, company_name, job_title, company_website, linkedin_url, contact_number, reason, verification_status, verified_at, created_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
  ]);

  if (recruiterResult.error) throw recruiterResult.error;
  if (!recruiterResult.data) return null;
  if (accountResult.error) throw accountResult.error;

  const row = recruiterResult.data;
  return {
    userId: row.user_id,
    fullName: row.full_name,
    workEmail: row.work_email,
    companyName: row.company_name,
    jobTitle: row.job_title,
    companyWebsite: row.company_website,
    linkedinUrl: row.linkedin_url,
    contactNumber: row.contact_number,
    reason: row.reason,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    avatarUrl: accountResult.data?.avatar_url ?? null,
    initials: recruiterInitials(row.full_name),
  };
}

export async function updateRecruiterEditableProfile(userId: string, data: RecruiterEditableProfile) {
  const { error } = await supabase
    .from("recruiter_profiles")
    .update({
      contact_number: data.contactNumber,
      job_title: data.jobTitle,
      company_name: data.companyName,
      company_website: data.companyWebsite,
      linkedin_url: data.linkedinUrl,
      reason: data.reason,
    })
    .eq("user_id", userId);
  if (error) throw error;

  if (data.avatarUrl) {
    const { error: avatarError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        avatar_url: data.avatarUrl,
      },
      { onConflict: "id" },
    );
    if (avatarError) throw avatarError;
  }
}

export async function uploadRecruiterAvatar(userId: string, file: File) {
  return uploadLearnerAvatar(userId, file);
}

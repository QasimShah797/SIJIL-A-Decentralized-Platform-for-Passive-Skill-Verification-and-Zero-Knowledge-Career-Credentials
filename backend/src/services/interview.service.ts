/**
 * Recruiter interview scheduling — persist interviews and email the candidate.
 */
import { supabaseService } from "./supabase.service";
import { recruiterService } from "./recruiter.service";
import { env } from "../config/env";
import { getUserSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { resolveLearnerDisplayName } from "../utils/learnerDisplayName";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTERVIEW_EMAIL_STATUS,
  INTERVIEW_STATUS,
  type InterviewMode,
  type InterviewStatus,
} from "../constants/interview";
import type {
  InterviewEmailDetails,
  ScheduleInterviewInput,
  ScheduledInterviewView,
} from "../types/interview.types";
import {
  sendInterviewCancellationEmail,
  sendInterviewInvitationEmail,
} from "../utils/interviewEmail";
import { isSmtpConfigured } from "../utils/mailer";
import type { AuthCaller } from "./learner-access";

type InterviewRow = Record<string, unknown>;

function rowToInterview(row: InterviewRow): ScheduledInterviewView {
  return {
    id: row.id as string,
    recruiterUserId: row.recruiter_user_id as string,
    candidateUserId: row.candidate_user_id as string,
    candidateName: (row.candidate_name as string) || "Candidate",
    candidateEmail: row.candidate_email as string,
    recruiterName: (row.recruiter_name as string) || "Recruiter",
    recruiterCompany: (row.recruiter_company as string | null) ?? null,
    scheduledAt: row.scheduled_at as string,
    durationMinutes: Number(row.duration_minutes),
    mode: row.mode as InterviewMode,
    locationOrLink: row.location_or_link as string,
    notes: (row.notes as string | null) ?? null,
    status: row.status as InterviewStatus,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    emailStatus: (row.email_status as string) ?? INTERVIEW_EMAIL_STATUS.NOT_SENT,
    createdAt: row.created_at as string,
  };
}

function toEmailDetails(
  interview: ScheduledInterviewView,
  recruiterTitle?: string | null,
): InterviewEmailDetails {
  return {
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    recruiterName: interview.recruiterName,
    recruiterCompany: interview.recruiterCompany,
    recruiterTitle,
    scheduledAt: new Date(interview.scheduledAt),
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    locationOrLink: interview.locationOrLink,
    notes: interview.notes,
  };
}

function interviewDb(accessToken?: string): SupabaseClient {
  const hasDedicatedServiceRole = env.SUPABASE_SERVICE_ROLE_KEY !== env.SUPABASE_ANON_KEY;
  if (hasDedicatedServiceRole) return supabaseService.client;
  if (accessToken) return getUserSupabase(accessToken);
  return supabaseService.client;
}

function normalizeLocationOrLink(mode: InterviewMode, value: string): string {
  const trimmed = value.trim();
  if (
    mode === "video_call"
    && !/^https?:\/\//i.test(trimmed)
    && /^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function markEmailStatus(id: string, status: string, accessToken?: string): Promise<void> {
  await interviewDb(accessToken)
    .from("scheduled_interviews")
    .update({ email_status: status })
    .eq("id", id);
}

async function resolveCandidateContact(
  candidateId: string,
  fallbackName: string,
  accessToken?: string,
): Promise<{
  email: string;
  name: string;
}> {
  const db = interviewDb(accessToken);
  const { data: profile } = await db
    .from("learner_profiles")
    .select("first_name, last_name, username, university_email")
    .eq("user_id", candidateId)
    .maybeSingle();

  let email = typeof profile?.university_email === "string" ? profile.university_email.trim() : "";
  let name = resolveLearnerDisplayName(profile);
  if (name === "Learner" && fallbackName.trim()) name = fallbackName.trim();

  if (accessToken) {
    const { data: rpcEmail } = await getUserSupabase(accessToken)
      .rpc("learner_contact_email", { _user_id: candidateId });
    if (typeof rpcEmail === "string" && rpcEmail.includes("@")) {
      email = rpcEmail.trim();
    }
  }

  if (!email.includes("@")) {
    try {
      const { data, error } = await supabaseService.client.auth.admin.getUserById(candidateId);
      if (!error && data?.user) {
        const registered = data.user.email?.trim();
        if (registered) email = registered;
        const metaName = data.user.user_metadata?.full_name;
        if (typeof metaName === "string" && metaName.trim() && name === "Learner") {
          name = metaName.trim();
        }
      }
    } catch {
      // auth.admin requires a service-role key.
    }
  }

  if (!email.includes("@")) {
    throw new AppError("This candidate has no registered email address", 400);
  }

  return { email: email.toLowerCase(), name };
}

async function resolveRecruiterProfile(recruiterId: string): Promise<{
  name: string;
  company: string | null;
  title: string | null;
}> {
  const { data } = await supabaseService.client
    .from("recruiter_profiles")
    .select("full_name, company_name, job_title")
    .eq("user_id", recruiterId)
    .maybeSingle();

  const name = typeof data?.full_name === "string" && data.full_name.trim()
    ? data.full_name.trim()
    : "A SIJIL recruiter";
  const company = typeof data?.company_name === "string" && data.company_name.trim()
    ? data.company_name.trim()
    : null;
  const title = typeof data?.job_title === "string" && data.job_title.trim()
    ? data.job_title.trim()
    : null;

  return { name, company, title };
}

export class InterviewService {
  async schedule(
    recruiterId: string,
    input: ScheduleInterviewInput,
    caller: AuthCaller,
    accessToken?: string,
  ): Promise<ScheduledInterviewView> {
    const candidate = await recruiterService.getCandidate(input.candidateId, caller, accessToken);
    if (!candidate) {
      throw new AppError(
        "Candidate not found. They must have shared verified credentials with recruiters.",
        404,
      );
    }

    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new AppError("A valid interview date and time is required", 400);
    }
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      throw new AppError("Interview date and time must be in the future", 400);
    }

    const [contact, recruiter] = await Promise.all([
      resolveCandidateContact(input.candidateId, candidate.name, accessToken),
      resolveRecruiterProfile(recruiterId),
    ]);

    const notes = input.notes?.trim() || null;
    const db = interviewDb(accessToken);

    const { data, error } = await db
      .from("scheduled_interviews")
      .insert({
        recruiter_user_id: recruiterId,
        candidate_user_id: input.candidateId,
        candidate_email: contact.email,
        candidate_name: contact.name,
        recruiter_name: recruiter.name,
        recruiter_company: recruiter.company,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: input.durationMinutes,
        mode: input.mode,
        location_or_link: normalizeLocationOrLink(input.mode, input.locationOrLink),
        notes,
        status: INTERVIEW_STATUS.SCHEDULED,
        email_status: INTERVIEW_EMAIL_STATUS.NOT_SENT,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError(error?.message ?? "Could not save the interview", 500);
    }

    const interview = rowToInterview(data as InterviewRow);

    try {
      const mail = await sendInterviewInvitationEmail(toEmailDetails(interview, recruiter.title));
      const emailStatus = mail.delivered ? INTERVIEW_EMAIL_STATUS.SENT : INTERVIEW_EMAIL_STATUS.NOT_SENT;
      await markEmailStatus(interview.id, emailStatus, accessToken);
      return { ...interview, emailStatus };
    } catch (err) {
      await markEmailStatus(interview.id, INTERVIEW_EMAIL_STATUS.FAILED, accessToken);
      const message = err instanceof Error ? err.message : "Could not send the interview invitation email";
      throw new AppError(
        `Interview was saved, but the invitation email could not be sent: ${message}`,
        502,
      );
    }
  }

  async listForRecruiter(
    recruiterId: string,
    candidateId?: string,
    accessToken?: string,
  ): Promise<ScheduledInterviewView[]> {
    let query = interviewDb(accessToken)
      .from("scheduled_interviews")
      .select("*")
      .eq("recruiter_user_id", recruiterId)
      .order("scheduled_at", { ascending: false });

    if (candidateId) {
      query = query.eq("candidate_user_id", candidateId);
    }

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);

    return (data ?? []).map((row) => rowToInterview(row as InterviewRow));
  }

  async cancel(
    recruiterId: string,
    interviewId: string,
    accessToken?: string,
  ): Promise<ScheduledInterviewView> {
    const db = interviewDb(accessToken);
    const { data: existing, error: fetchError } = await db
      .from("scheduled_interviews")
      .select("*")
      .eq("id", interviewId)
      .eq("recruiter_user_id", recruiterId)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500);
    if (!existing) throw new AppError("Interview not found", 404);

    const current = rowToInterview(existing as InterviewRow);
    if (current.status === INTERVIEW_STATUS.CANCELLED) {
      throw new AppError("This interview is already cancelled", 409);
    }

    const cancelledAt = new Date().toISOString();
    const { data, error } = await db
      .from("scheduled_interviews")
      .update({
        status: INTERVIEW_STATUS.CANCELLED,
        cancelled_at: cancelledAt,
      })
      .eq("id", interviewId)
      .eq("recruiter_user_id", recruiterId)
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError(error?.message ?? "Could not cancel the interview", 500);
    }

    const interview = rowToInterview(data as InterviewRow);
    const { title } = await resolveRecruiterProfile(recruiterId);

    try {
      const mail = await sendInterviewCancellationEmail(toEmailDetails(interview, title));
      const emailStatus = mail.delivered ? INTERVIEW_EMAIL_STATUS.SENT : INTERVIEW_EMAIL_STATUS.NOT_SENT;
      await markEmailStatus(interview.id, emailStatus, accessToken);
      return { ...interview, emailStatus };
    } catch (err) {
      await markEmailStatus(interview.id, INTERVIEW_EMAIL_STATUS.FAILED, accessToken);
      const message = err instanceof Error ? err.message : "Could not send the cancellation email";
      throw new AppError(
        `Interview was cancelled, but the candidate email could not be sent: ${message}`,
        502,
      );
    }
  }

  async resendEmail(
    recruiterId: string,
    interviewId: string,
    accessToken?: string,
  ): Promise<ScheduledInterviewView> {
    if (!isSmtpConfigured()) {
      throw new AppError(
        "Email cannot be sent until SMTP_USER and SMTP_PASS are set in backend/.env. Use a Gmail App Password, then restart the backend.",
        503,
      );
    }

    const db = interviewDb(accessToken);
    const { data: existing, error: fetchError } = await db
      .from("scheduled_interviews")
      .select("*")
      .eq("id", interviewId)
      .eq("recruiter_user_id", recruiterId)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500);
    if (!existing) throw new AppError("Interview not found", 404);

    const interview = rowToInterview(existing as InterviewRow);
    const { title } = await resolveRecruiterProfile(recruiterId);
    const details = toEmailDetails(interview, title);

    try {
      const mail = interview.status === INTERVIEW_STATUS.CANCELLED
        ? await sendInterviewCancellationEmail(details)
        : await sendInterviewInvitationEmail(details);
      if (!mail.delivered) {
        throw new Error("SMTP did not accept the message");
      }
      await markEmailStatus(interview.id, INTERVIEW_EMAIL_STATUS.SENT, accessToken);
      return { ...interview, emailStatus: INTERVIEW_EMAIL_STATUS.SENT };
    } catch (err) {
      await markEmailStatus(interview.id, INTERVIEW_EMAIL_STATUS.FAILED, accessToken);
      const message = err instanceof Error ? err.message : "Could not send the email";
      throw new AppError(`Could not send the interview email: ${message}`, 502);
    }
  }
}

export const interviewService = new InterviewService();

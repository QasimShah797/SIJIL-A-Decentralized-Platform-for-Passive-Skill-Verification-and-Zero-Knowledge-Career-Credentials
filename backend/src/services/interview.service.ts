/**
 * Recruiter interview scheduling — persist interviews and email the candidate.
 */
import { supabaseService } from "./supabase.service";
import { recruiterService } from "./recruiter.service";
import { getGoogleCalendarOAuthConfig } from "../config/google-calendar";
import { env } from "../config/env";
import { getUserSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { resolveLearnerDisplayName } from "../utils/learnerDisplayName";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTERVIEW_EMAIL_STATUS,
  INTERVIEW_MODE,
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
import { storedInterviewTimeZone } from "../utils/interviewEmailContent";
import { isSmtpConfigured } from "../utils/mailer";
import type { AuthCaller } from "./learner-access";
import {
  finishInvitationDelivery,
  interviewSaveFailure,
  safeMailFailure,
} from "./interview-delivery";
import {
  createGoogleMeetEvent,
  deleteGoogleCalendarEventQuietly,
} from "./google-calendar-events.service";

type InterviewRow = Record<string, unknown>;

const scheduleInFlight = new Set<string>();

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
    timeZone: (row.time_zone as string | null) ?? null,
    googleCalendarEventId: (row.google_calendar_event_id as string | null) ?? null,
    status: row.status as InterviewStatus,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    emailStatus: (row.email_status as string) ?? INTERVIEW_EMAIL_STATUS.NOT_SENT,
    createdAt: row.created_at as string,
  };
}

function learnerInterviewUrl(): string {
  return `${env.FRONTEND_URL.replace(/\/$/, "")}/learner/interviews`;
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
    timeZone: storedInterviewTimeZone(interview.timeZone),
    portalUrl: learnerInterviewUrl(),
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
  if (!trimmed) return trimmed;
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

  if (accessToken && !email.includes("@")) {
    const { data: rpcEmail } = await getUserSupabase(accessToken)
      .rpc("learner_contact_email", { _user_id: candidateId });
    if (typeof rpcEmail === "string" && rpcEmail.includes("@")) {
      email = rpcEmail.trim();
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
    const flightKey = `${recruiterId}:${input.candidateId}:${scheduledAt.toISOString()}`;
    if (scheduleInFlight.has(flightKey)) {
      throw new AppError("An interview with this learner is already being scheduled at that time", 409);
    }
    scheduleInFlight.add(flightKey);
    try {
    const windowStart = new Date(scheduledAt.getTime() - 60_000).toISOString();
    const windowEnd = new Date(scheduledAt.getTime() + 60_000).toISOString();
    const { data: duplicate, error: duplicateError } = await db
      .from("scheduled_interviews")
      .select("id")
      .eq("recruiter_user_id", recruiterId)
      .eq("candidate_user_id", input.candidateId)
      .eq("status", INTERVIEW_STATUS.SCHEDULED)
      .gte("scheduled_at", windowStart)
      .lte("scheduled_at", windowEnd)
      .limit(1);
    if (duplicateError) throw new AppError(duplicateError.message, 500);
    if (duplicate && duplicate.length > 0) {
      throw new AppError("An interview with this learner is already scheduled at that time", 409);
    }

    const timeZone = storedInterviewTimeZone(input.timeZone);
    let locationOrLink = normalizeLocationOrLink(input.mode, input.locationOrLink ?? "");
    let googleCalendarEventId: string | null = null;
    const manualVideoOverride =
      input.mode === INTERVIEW_MODE.VIDEO_CALL
      && locationOrLink.length >= 3
      && /^https?:\/\//i.test(locationOrLink);

    // Video calls: create Meet on the SIJIL Calendar BEFORE insert/email (unless recruiter overrode).
    if (input.mode === INTERVIEW_MODE.VIDEO_CALL && !manualVideoOverride) {
      if (!getGoogleCalendarOAuthConfig()) {
        throw new AppError("Automatic Google Meet is unavailable. Enter your own meeting link, or ask a SIJIL administrator to configure Google Calendar.", 503);
      }
      const meet = await createGoogleMeetEvent({
        summary: `SIJIL interview: ${contact.name} / ${recruiter.name}`,
        description: [
          `Candidate: ${contact.name} <${contact.email}>`,
          `Recruiter: ${recruiter.name}`,
          recruiter.company ? `Company: ${recruiter.company}` : null,
          notes ? `Notes: ${notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        startIso: scheduledAt.toISOString(),
        durationMinutes: input.durationMinutes,
        timeZone,
        attendeeEmail: contact.email,
      });
      locationOrLink = meet.meetUrl;
      googleCalendarEventId = meet.eventId;
    } else if (!locationOrLink || locationOrLink.trim().length < 3) {
      throw new AppError("Location or call details are required", 400);
    }

    const insertPayload: Record<string, unknown> = {
      recruiter_user_id: recruiterId,
      candidate_user_id: input.candidateId,
      candidate_email: contact.email,
      candidate_name: contact.name,
      recruiter_name: recruiter.name,
      recruiter_company: recruiter.company,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: input.durationMinutes,
      mode: input.mode,
      location_or_link: locationOrLink,
      notes,
      status: INTERVIEW_STATUS.SCHEDULED,
      email_status: INTERVIEW_EMAIL_STATUS.NOT_SENT,
      time_zone: timeZone,
    };
    if (googleCalendarEventId) {
      insertPayload.google_calendar_event_id = googleCalendarEventId;
    }

    const { data, error } = await db
      .from("scheduled_interviews")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      const code = error && "code" in error ? error.code ?? null : null;
      const missingZone = code === "42703" || /time_zone/i.test(error?.message ?? "");
      const missingEventCol = code === "42703" || /google_calendar_event_id/i.test(error?.message ?? "");
      console.error("interview save failed", { code });
      if (missingZone && /time_zone/i.test(error?.message ?? "")) {
        if (googleCalendarEventId) await deleteGoogleCalendarEventQuietly(googleCalendarEventId);
        throw new AppError(
          "Interview scheduling needs the scheduled_interviews time_zone column. Apply supabase/migrations/20261118120000_scheduled_interviews_time_zone.sql first.",
          503,
        );
      }
      if (missingEventCol && googleCalendarEventId) {
        // Column not applied yet: retry insert without event id; Meet URL still in location_or_link.
        const { google_calendar_event_id: _omit, ...withoutEventId } = insertPayload;
        void _omit;
        const retry = await db.from("scheduled_interviews").insert(withoutEventId).select("*").single();
        if (retry.error || !retry.data) {
          await deleteGoogleCalendarEventQuietly(googleCalendarEventId);
          throw interviewSaveFailure();
        }
        const interviewFallback = rowToInterview(retry.data as InterviewRow);
        const emailStatusFallback = await finishInvitationDelivery({
          send: () => sendInterviewInvitationEmail(toEmailDetails(interviewFallback, recruiter.title)),
          mark: (status) => markEmailStatus(interviewFallback.id, status, accessToken),
        });
        return { ...interviewFallback, emailStatus: emailStatusFallback };
      }
      if (googleCalendarEventId) await deleteGoogleCalendarEventQuietly(googleCalendarEventId);
      throw interviewSaveFailure();
    }

    const interview = rowToInterview(data as InterviewRow);
    // Meet URL is already persisted — only then send the invitation email.
    const emailStatus = await finishInvitationDelivery({
      send: () => sendInterviewInvitationEmail(toEmailDetails(interview, recruiter.title)),
      mark: (status) => markEmailStatus(interview.id, status, accessToken),
    });
    return { ...interview, emailStatus };
    } finally {
      scheduleInFlight.delete(flightKey);
    }
  }

  async listForLearner(learnerId: string, accessToken?: string): Promise<ScheduledInterviewView[]> {
    const { data, error } = await interviewDb(accessToken)
      .from("scheduled_interviews")
      .select("*")
      .eq("candidate_user_id", learnerId)
      .order("scheduled_at", { ascending: false });
    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((row) => rowToInterview(row as InterviewRow));
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

    if (current.googleCalendarEventId) {
      await deleteGoogleCalendarEventQuietly(current.googleCalendarEventId);
    }

    const interview = rowToInterview(data as InterviewRow);
    const { title } = await resolveRecruiterProfile(recruiterId);

    const emailStatus = await finishInvitationDelivery({
      send: () => sendInterviewCancellationEmail(toEmailDetails(interview, title)),
      mark: (status) => markEmailStatus(interview.id, status, accessToken),
    });
    return { ...interview, emailStatus };
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
      console.error("[SIJIL Backend Error] Interview email was not accepted.", safeMailFailure(err));
      throw new AppError("The email provider did not accept the invitation.", 502);
    }
  }
}

export const interviewService = new InterviewService();

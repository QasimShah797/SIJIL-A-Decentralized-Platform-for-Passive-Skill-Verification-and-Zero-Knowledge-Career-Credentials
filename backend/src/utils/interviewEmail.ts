/**
 * Recruiter interview invitation and cancellation emails.
 * Uses the same SIJIL SMTP pipeline and HTML chrome as peer-review invitations.
 */
import type { InterviewEmailDetails } from "../types/interview.types";
import { sendSijilMail, type MailSendResult } from "./mailer";
import {
  buildInterviewCancelHtml,
  buildInterviewCancelText,
  buildInterviewInviteHtml,
  buildInterviewInviteText,
  formatInterviewWhen,
} from "./interviewEmailContent";

export {
  buildInterviewCancelHtml,
  buildInterviewCancelText,
  buildInterviewInviteHtml,
  buildInterviewInviteText,
  formatDuration,
  formatInterviewWhen,
} from "./interviewEmailContent";

export async function sendInterviewInvitationEmail(
  details: InterviewEmailDetails,
): Promise<MailSendResult> {
  const company = details.recruiterCompany?.trim();
  const subject = company
    ? `Interview invitation from ${company} — SIJIL`
    : `Interview invitation from ${details.recruiterName} — SIJIL`;

  try {
    return await sendSijilMail({
      to: details.candidateEmail,
      subject,
      text: buildInterviewInviteText(details),
      html: buildInterviewInviteHtml(details),
      logLabel: "SIJIL Interview Email",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    throw new Error(`Failed to send interview invitation email: ${message}`);
  }
}

export async function sendInterviewCancellationEmail(
  details: InterviewEmailDetails,
): Promise<MailSendResult> {
  const { date } = formatInterviewWhen(details.scheduledAt);
  const subject = `Interview cancelled — ${date} — SIJIL`;

  try {
    return await sendSijilMail({
      to: details.candidateEmail,
      subject,
      text: buildInterviewCancelText(details),
      html: buildInterviewCancelHtml(details),
      logLabel: "SIJIL Interview Email",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    throw new Error(`Failed to send interview cancellation email: ${message}`);
  }
}

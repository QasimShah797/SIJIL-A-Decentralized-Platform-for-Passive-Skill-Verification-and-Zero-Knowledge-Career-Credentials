/**
 * Interview invitation and cancellation email bodies.
 * Uses the same SIJIL HTML chrome as peer-review invitations.
 */
import {
  INTERVIEW_LOCATION_LABELS,
  INTERVIEW_MODE_LABELS,
  type InterviewMode,
} from "../constants/interview";
import type { InterviewEmailDetails } from "../types/interview.types";
import { escapeHtml, wrapSijilEmail } from "./emailHtml";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function formatInterviewWhen(scheduledAt: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(scheduledAt);

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(scheduledAt);

  return { date, time: `${time} UTC` };
}

export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

function recruiterLine(details: InterviewEmailDetails): string {
  const company = details.recruiterCompany?.trim();
  const title = details.recruiterTitle?.trim();
  if (company && title) return `${details.recruiterName}, ${title} at ${company}`;
  if (company) return `${details.recruiterName} at ${company}`;
  return details.recruiterName;
}

function detailBlock(label: string, valueHtml: string, first = false): string {
  const margin = first ? "0 0 8px" : "16px 0 8px";
  return `
                    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin:${margin};">${escapeHtml(label)}</div>
                    <div style="font-size:15px;color:#334155;">${valueHtml}</div>`;
}

function locationHtml(mode: InterviewMode, locationOrLink: string): string {
  const value = locationOrLink.trim();
  const safeValue = escapeHtml(value);
  const inner = isHttpUrl(value)
    ? `<a href="${safeValue}" style="color:#2563eb;word-break:break-all;">${safeValue}</a>`
    : safeValue;
  return detailBlock(INTERVIEW_LOCATION_LABELS[mode], inner);
}

export function buildInterviewInviteText(details: InterviewEmailDetails): string {
  const { date, time } = formatInterviewWhen(details.scheduledAt);
  const locationLabel = INTERVIEW_LOCATION_LABELS[details.mode];
  const lines = [
    `Hello ${details.candidateName},`,
    "",
    `${recruiterLine(details)} has invited you to an interview through SIJIL.`,
    "",
    `Date: ${date}`,
    `Time: ${time}`,
    `Duration: ${formatDuration(details.durationMinutes)}`,
    `Interview mode: ${INTERVIEW_MODE_LABELS[details.mode]}`,
    `${locationLabel}: ${details.locationOrLink}`,
  ];

  const notes = details.notes?.trim();
  if (notes) {
    lines.push("", "Notes from the recruiter:", notes);
  }

  lines.push(
    "",
    "Please add this interview to your calendar and reach out to the recruiter if you need to reschedule.",
    "",
    "— SIJIL · Passive Skill Verification",
  );

  return lines.join("\n");
}

export function buildInterviewInviteHtml(details: InterviewEmailDetails): string {
  const { date, time } = formatInterviewWhen(details.scheduledAt);
  const notes = details.notes?.trim();
  const greeting = `Hello ${escapeHtml(details.candidateName)},`;
  const recruiter = escapeHtml(recruiterLine(details));

  const bodyHtml = `
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                <strong>${recruiter}</strong> has invited you to an interview through SIJIL.
                Please review the details below and add this appointment to your calendar.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    ${detailBlock("Date", escapeHtml(date), true)}
                    ${detailBlock("Time", escapeHtml(time))}
                    ${detailBlock("Duration", escapeHtml(formatDuration(details.durationMinutes)))}
                    ${detailBlock("Interview mode", escapeHtml(INTERVIEW_MODE_LABELS[details.mode]))}
                    ${locationHtml(details.mode, details.locationOrLink)}
                    ${notes ? detailBlock("Notes from the recruiter", escapeHtml(notes).replace(/\n/g, "<br />")) : ""}
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                If you cannot attend, please contact the recruiter so they can reschedule.
              </p>`;

  return wrapSijilEmail({
    documentTitle: "SIJIL Interview Invitation",
    subtitle: "Interview Invitation",
    bodyHtml,
  });
}

export function buildInterviewCancelText(details: InterviewEmailDetails): string {
  const { date, time } = formatInterviewWhen(details.scheduledAt);
  const lines = [
    `Hello ${details.candidateName},`,
    "",
    `The interview scheduled with ${recruiterLine(details)} has been cancelled.`,
    "",
    "Cancelled appointment:",
    `Date: ${date}`,
    `Time: ${time}`,
    `Duration: ${formatDuration(details.durationMinutes)}`,
    `Interview mode: ${INTERVIEW_MODE_LABELS[details.mode]}`,
    `${INTERVIEW_LOCATION_LABELS[details.mode]}: ${details.locationOrLink}`,
    "",
    "You do not need to take any further action. The recruiter may reach out if they wish to reschedule.",
    "",
    "— SIJIL · Passive Skill Verification",
  ];

  return lines.join("\n");
}

export function buildInterviewCancelHtml(details: InterviewEmailDetails): string {
  const { date, time } = formatInterviewWhen(details.scheduledAt);
  const greeting = `Hello ${escapeHtml(details.candidateName)},`;
  const recruiter = escapeHtml(recruiterLine(details));

  const bodyHtml = `
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                The interview scheduled with <strong>${recruiter}</strong> has been cancelled.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    ${detailBlock("Cancelled date", escapeHtml(date), true)}
                    ${detailBlock("Time", escapeHtml(time))}
                    ${detailBlock("Duration", escapeHtml(formatDuration(details.durationMinutes)))}
                    ${detailBlock("Interview mode", escapeHtml(INTERVIEW_MODE_LABELS[details.mode]))}
                    ${locationHtml(details.mode, details.locationOrLink)}
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                You do not need to take any further action. The recruiter may reach out if they wish to reschedule.
              </p>`;

  return wrapSijilEmail({
    documentTitle: "SIJIL Interview Cancelled",
    subtitle: "Interview Cancelled",
    bodyHtml,
  });
}

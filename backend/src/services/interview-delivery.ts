/**
 * Separate a saved interview from whether the mail provider accepted it.
 * These helpers do not open a database connection or send email.
 */
import { AppError } from "../utils/AppError";
import { INTERVIEW_EMAIL_STATUS } from "../constants/interview";

export type InvitationEmailStatus =
  | typeof INTERVIEW_EMAIL_STATUS.SENT
  | typeof INTERVIEW_EMAIL_STATUS.NOT_SENT
  | typeof INTERVIEW_EMAIL_STATUS.FAILED;

export function safeMailFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (/535|invalid login|username and password|authentication|auth/i.test(message)) {
    return "smtp_auth_rejected";
  }
  return "smtp_rejected";
}

export async function finishInvitationDelivery(input: {
  send: () => Promise<{ delivered: boolean }>;
  mark: (status: InvitationEmailStatus) => Promise<void>;
}): Promise<InvitationEmailStatus> {
  try {
    const mail = await input.send();
    const status = mail.delivered ? INTERVIEW_EMAIL_STATUS.SENT : INTERVIEW_EMAIL_STATUS.NOT_SENT;
    await input.mark(status);
    return status;
  } catch (err) {
    await input.mark(INTERVIEW_EMAIL_STATUS.FAILED);
    console.error("[SIJIL Backend Error] The interview record was kept, but the email was not accepted.", safeMailFailure(err));
    return INTERVIEW_EMAIL_STATUS.FAILED;
  }
}

export function interviewSaveFailure(): AppError {
  return new AppError("Could not save the interview", 500);
}

export function scheduleResultMessage(emailStatus: string): string {
  if (emailStatus === INTERVIEW_EMAIL_STATUS.SENT) {
    return "Interview scheduled and invitation emailed";
  }
  if (emailStatus === INTERVIEW_EMAIL_STATUS.FAILED) {
    return "Interview scheduled, but the email provider did not accept the invitation.";
  }
  return "Interview scheduled. Invitation was not emailed because SMTP_USER and SMTP_PASS are not set in backend/.env.";
}

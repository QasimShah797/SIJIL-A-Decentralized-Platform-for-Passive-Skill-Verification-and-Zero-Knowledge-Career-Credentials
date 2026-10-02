/**
 * Recruiter interview scheduling HTTP handlers.
 */
import { Request, Response } from "express";
import { interviewService } from "../services/interview.service";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { callerFromRequest } from "../services/learner-access";
import { INTERVIEW_EMAIL_STATUS } from "../constants/interview";
import {
  listInterviewsQuerySchema,
  scheduleInterviewSchema,
} from "../validators/interview.validator";

export async function scheduleInterview(req: Request, res: Response): Promise<Response> {
  const input = scheduleInterviewSchema.parse(req.body);
  const interview = await interviewService.schedule(
    req.user!.id,
    input,
    callerFromRequest(req),
    req.accessToken,
  );
  const emailed = interview.emailStatus === INTERVIEW_EMAIL_STATUS.SENT;
  return sendSuccess(
    res,
    interview,
    emailed
      ? "Interview scheduled and invitation emailed"
      : "Interview scheduled. Invitation was not emailed because SMTP_USER and SMTP_PASS are not set in backend/.env.",
    201,
  );
}

export async function listInterviews(req: Request, res: Response): Promise<Response> {
  const { candidateId } = listInterviewsQuerySchema.parse(req.query);
  const interviews = await interviewService.listForRecruiter(req.user!.id, candidateId, req.accessToken);
  return sendSuccess(res, interviews);
}

export async function cancelInterview(req: Request, res: Response): Promise<Response> {
  const interviewId = paramString(req.params.id, "id");
  const interview = await interviewService.cancel(req.user!.id, interviewId, req.accessToken);
  const emailed = interview.emailStatus === INTERVIEW_EMAIL_STATUS.SENT;
  return sendSuccess(
    res,
    interview,
    emailed
      ? "Interview cancelled and candidate notified"
      : "Interview cancelled. Notification was not emailed because SMTP is not configured.",
  );
}

export async function resendInterviewEmail(req: Request, res: Response): Promise<Response> {
  const interviewId = paramString(req.params.id, "id");
  const interview = await interviewService.resendEmail(req.user!.id, interviewId, req.accessToken);
  return sendSuccess(res, interview, "Interview email sent");
}

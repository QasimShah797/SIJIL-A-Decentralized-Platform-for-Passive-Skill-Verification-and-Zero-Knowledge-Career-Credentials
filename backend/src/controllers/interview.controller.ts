/**
 * Recruiter interview scheduling HTTP handlers.
 */
import { Request, Response } from "express";
import { interviewService } from "../services/interview.service";
import { sendSuccess } from "../utils/apiResponse";
import { paramString } from "../utils/params";
import { callerFromRequest } from "../services/learner-access";
import { INTERVIEW_EMAIL_STATUS } from "../constants/interview";
import { scheduleResultMessage } from "../services/interview-delivery";
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
  return sendSuccess(res, interview, scheduleResultMessage(interview.emailStatus), 201);
}

export async function listMyInterviews(req: Request, res: Response): Promise<Response> {
  const interviews = await interviewService.listForLearner(req.user!.id, req.accessToken);
  return sendSuccess(res, interviews);
}

export async function listInterviews(req: Request, res: Response): Promise<Response> {
  const { candidateId } = listInterviewsQuerySchema.parse(req.query);
  const interviews = await interviewService.listForRecruiter(req.user!.id, candidateId, req.accessToken);
  return sendSuccess(res, interviews);
}

export async function cancelInterview(req: Request, res: Response): Promise<Response> {
  const interviewId = paramString(req.params.id, "id");
  const interview = await interviewService.cancel(req.user!.id, interviewId, req.accessToken);
  const message = interview.emailStatus === INTERVIEW_EMAIL_STATUS.SENT
    ? "Interview cancelled and the candidate was emailed"
    : interview.emailStatus === INTERVIEW_EMAIL_STATUS.FAILED
      ? "Interview cancelled. The cancellation email was not accepted."
      : "Interview cancelled. The cancellation email was not sent.";
  return sendSuccess(res, interview, message);
}

export async function resendInterviewEmail(req: Request, res: Response): Promise<Response> {
  const interviewId = paramString(req.params.id, "id");
  const interview = await interviewService.resendEmail(req.user!.id, interviewId, req.accessToken);
  return sendSuccess(res, interview, "Interview email sent");
}

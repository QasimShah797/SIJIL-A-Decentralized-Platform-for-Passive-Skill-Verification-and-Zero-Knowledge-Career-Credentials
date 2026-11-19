/**
 * Recruiter interview scheduling API.
 */
import { apiRequest } from "./client";
import type { ScheduleInterviewInput, ScheduledInterviewView } from "@/lib/interview";

export type { ScheduleInterviewInput, ScheduledInterviewView };

const INTERVIEW_REQUEST_MS = 30_000;

async function interviewRequest<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERVIEW_REQUEST_MS);
  try {
    return await apiRequest<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. Refresh Interviews before trying again so a saved interview is not created twice.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function scheduleInterviewApi(
  input: ScheduleInterviewInput,
): Promise<ScheduledInterviewView> {
  return interviewRequest<ScheduledInterviewView>("/recruiter/interviews", input);
}

export async function listMyInterviewsApi(): Promise<ScheduledInterviewView[]> {
  return apiRequest<ScheduledInterviewView[]>("/learner/interviews");
}

export async function listInterviewsApi(candidateId?: string): Promise<ScheduledInterviewView[]> {
  const params = new URLSearchParams();
  if (candidateId) params.set("candidateId", candidateId);
  const qs = params.toString();
  return apiRequest<ScheduledInterviewView[]>(`/recruiter/interviews${qs ? `?${qs}` : ""}`);
}

export async function cancelInterviewApi(interviewId: string): Promise<ScheduledInterviewView> {
  return apiRequest<ScheduledInterviewView>(
    `/recruiter/interviews/${encodeURIComponent(interviewId)}/cancel`,
    { method: "POST" },
  );
}

export async function resendInterviewEmailApi(interviewId: string): Promise<ScheduledInterviewView> {
  return interviewRequest<ScheduledInterviewView>(
    `/recruiter/interviews/${encodeURIComponent(interviewId)}/resend-email`,
    {},
  );
}

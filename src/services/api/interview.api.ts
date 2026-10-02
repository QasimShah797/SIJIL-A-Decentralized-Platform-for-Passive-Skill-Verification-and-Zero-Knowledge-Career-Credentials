/**
 * Recruiter interview scheduling API.
 */
import { apiRequest } from "./client";
import type { ScheduleInterviewInput, ScheduledInterviewView } from "@/lib/interview";

export type { ScheduleInterviewInput, ScheduledInterviewView };

export async function scheduleInterviewApi(
  input: ScheduleInterviewInput,
): Promise<ScheduledInterviewView> {
  return apiRequest<ScheduledInterviewView>("/recruiter/interviews", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  return apiRequest<ScheduledInterviewView>(
    `/recruiter/interviews/${encodeURIComponent(interviewId)}/resend-email`,
    { method: "POST" },
  );
}

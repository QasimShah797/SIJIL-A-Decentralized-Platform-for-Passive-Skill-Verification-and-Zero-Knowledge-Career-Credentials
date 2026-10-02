import type { InterviewMode, InterviewStatus } from "../constants/interview";

export interface ScheduleInterviewInput {
  candidateId: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  locationOrLink: string;
  notes?: string;
}

export interface ScheduledInterviewView {
  id: string;
  recruiterUserId: string;
  candidateUserId: string;
  candidateName: string;
  candidateEmail: string;
  recruiterName: string;
  recruiterCompany: string | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  locationOrLink: string;
  notes: string | null;
  status: InterviewStatus;
  cancelledAt: string | null;
  emailStatus: string;
  createdAt: string;
}

export interface InterviewEmailDetails {
  candidateName: string;
  candidateEmail: string;
  recruiterName: string;
  recruiterCompany: string | null;
  recruiterTitle?: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  mode: InterviewMode;
  locationOrLink: string;
  notes?: string | null;
}

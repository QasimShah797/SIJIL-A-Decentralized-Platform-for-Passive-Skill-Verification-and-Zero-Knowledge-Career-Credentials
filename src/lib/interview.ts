export const INTERVIEW_MODE = {
  IN_PERSON: "in_person",
  VIDEO_CALL: "video_call",
  PHONE: "phone",
} as const;

export type InterviewMode = (typeof INTERVIEW_MODE)[keyof typeof INTERVIEW_MODE];

export type InterviewStatus = "scheduled" | "cancelled";

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  in_person: "In person",
  video_call: "Video call",
  phone: "Phone",
};

export const INTERVIEW_LOCATION_LABELS: Record<InterviewMode, string> = {
  in_person: "Location",
  video_call: "Meeting link",
  phone: "Phone number or dial-in",
};

export const INTERVIEW_LOCATION_PLACEHOLDERS: Record<InterviewMode, string> = {
  in_person: "Office address or building and room",
  video_call: "https://meet.example.com/interview",
  phone: "Phone number or conference dial-in",
};

export const INTERVIEW_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

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

export function formatInterviewDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatInterviewDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}

export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultInterviewDateTime(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  return toDateTimeLocalValue(next);
}

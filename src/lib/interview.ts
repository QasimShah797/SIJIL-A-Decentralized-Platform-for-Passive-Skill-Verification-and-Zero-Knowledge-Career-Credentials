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
  /** Optional for video_call — SIJIL generates Google Meet when omitted. */
  locationOrLink?: string;
  notes?: string;
  timeZone?: string;
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
  timeZone?: string | null;
  googleCalendarEventId?: string | null;
  status: InterviewStatus;
  cancelledAt: string | null;
  emailStatus: string;
  createdAt: string;
}

export function interviewMeetingHref(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function formatInterviewDateTime(iso: string, timeZone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const zone = timeZone?.trim() || undefined;
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  });
}

export function formatInterviewDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}

/** Interpret a datetime-local value as wall-clock time in an IANA timezone. */
export function zonedDateTimeToIso(localValue: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue.trim());
  if (!match) return new Date(localValue).toISOString();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const zonedAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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

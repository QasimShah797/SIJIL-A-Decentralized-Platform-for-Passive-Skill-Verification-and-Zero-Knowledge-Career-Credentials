/** Interview scheduling constants for recruiter workspace. */

export const INTERVIEW_MODE = {
  IN_PERSON: "in_person",
  VIDEO_CALL: "video_call",
  PHONE: "phone",
} as const;

export type InterviewMode = (typeof INTERVIEW_MODE)[keyof typeof INTERVIEW_MODE];

export const INTERVIEW_STATUS = {
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
} as const;

export type InterviewStatus = (typeof INTERVIEW_STATUS)[keyof typeof INTERVIEW_STATUS];

export const INTERVIEW_EMAIL_STATUS = {
  NOT_SENT: "not_sent",
  SENT: "sent",
  FAILED: "failed",
} as const;

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  in_person: "In person",
  video_call: "Video call",
  phone: "Phone",
};

export const INTERVIEW_LOCATION_LABELS: Record<InterviewMode, string> = {
  in_person: "Location",
  video_call: "Meeting link",
  phone: "Call details",
};

export const INTERVIEW_DURATION_MINUTES = [15, 30, 45, 60, 90, 120] as const;
export const INTERVIEW_DURATION_MIN = 15;
export const INTERVIEW_DURATION_MAX = 240;

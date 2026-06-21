/** Context review display and storage constants. */

export const REVIEW_TYPE = {
  IMPORTED: "Imported Context Review",
  VERIFIED: "Context Verified Review",
} as const;

export const REVIEW_DISPLAY_STATUS = {
  IMPORTED: "Imported Context Review",
  NO_EXTERNAL: "No External Review Found",
  REQUEST_SENT: "Review Request Sent",
  AWAITING: "Awaiting Feedback",
  VERIFIED: "Context Verified Review",
} as const;

export const REVIEW_REQUEST_STATUS = {
  SENT: "sent",
  AWAITING: "awaiting_feedback",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export const CONTEXT_RECOMMENDATION = {
  SUPPORT: "Support",
  NEEDS_MORE: "Needs More Evidence",
  NOT_ENOUGH: "Not Enough Context",
} as const;

export type ContextRecommendation =
  (typeof CONTEXT_RECOMMENDATION)[keyof typeof CONTEXT_RECOMMENDATION];

export const REVIEW_TOKEN_TTL_DAYS = 14;

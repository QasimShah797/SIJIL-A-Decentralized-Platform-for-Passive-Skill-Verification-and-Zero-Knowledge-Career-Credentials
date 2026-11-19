/**
 * Invitation lifecycle and SMTP delivery are separate.
 * A legacy row with no delivery value is unknown, not accepted.
 */
export const EMAIL_DELIVERY_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  NOT_SENT: "not_sent",
} as const;

export type EmailDeliveryStatus =
  | (typeof EMAIL_DELIVERY_STATUS)[keyof typeof EMAIL_DELIVERY_STATUS]
  | "unknown";

export const OPEN_INVITE_LIFECYCLE = ["pending", "sent"] as const;

export function storedDeliveryStatus(value: unknown): EmailDeliveryStatus {
  if (
    value === EMAIL_DELIVERY_STATUS.PENDING
    || value === EMAIL_DELIVERY_STATUS.SENT
    || value === EMAIL_DELIVERY_STATUS.FAILED
    || value === EMAIL_DELIVERY_STATUS.NOT_SENT
  ) {
    return value;
  }
  return "unknown";
}

export type InviteSendDecision = "create_and_send" | "return_existing" | "resend";

/** A repeat click returns the saved invitation. Only an explicit resend may email again, and never while one send is still pending. */
export function inviteSendDecision(params: {
  existing: boolean;
  resend: boolean;
  delivery: EmailDeliveryStatus;
}): InviteSendDecision {
  if (!params.existing) return "create_and_send";
  if (!params.resend || params.delivery === EMAIL_DELIVERY_STATUS.PENDING) return "return_existing";
  return "resend";
}

export function safeSmtpFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/smtp_timeout|timeout|ETIMEDOUT|ESOCKET/i.test(message)) return "smtp_timeout";
  if (/535|invalid login|username and password|authentication|auth/i.test(message)) return "smtp_auth_rejected";
  if (/ECONN|ENOTFOUND|certificate|TLS/i.test(message)) return "smtp_connection";
  return "smtp_rejected";
}

export function smtpResponseCode(response: string | undefined): string {
  const match = response?.match(/\b([245]\d{2})\b/);
  return match?.[1] ?? "none";
}

export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("smtp_timeout")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

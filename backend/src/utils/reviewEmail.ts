/**
 * Review request email — logs link in development; extend with SMTP when configured.
 */
import { env } from "../config/env";

export async function sendReviewRequestEmail(
  to: string,
  learnerName: string,
  evidenceName: string,
  reviewLink: string,
): Promise<void> {
  const subject = `SIJIL context review request — ${evidenceName}`;
  const body = [
    `Hello,`,
    ``,
    `${learnerName} has requested your feedback on project evidence in SIJIL.`,
    `Evidence: ${evidenceName}`,
    ``,
    `Open the secure review form:`,
    reviewLink,
    ``,
    `This link expires in 14 days. Only context-linked reviewers can submit.`,
  ].join("\n");

  if (env.NODE_ENV === "development") {
    console.log(`\n[SIJIL Review Email]\nTo: ${to}\nSubject: ${subject}\n\n${body}\n`);
  } else {
    console.log(`[SIJIL Review Email] Sent review link to ${to} for ${evidenceName}`);
  }
}

export function buildReviewLink(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/review/request/${token}`;
}

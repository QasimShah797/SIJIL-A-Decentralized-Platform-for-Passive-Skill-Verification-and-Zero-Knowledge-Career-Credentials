/**
 * Peer review invitation emails via Gmail SMTP (Nodemailer).
 * Falls back to console logging when SMTP is not configured.
 */
import { env } from "../config/env";
import { PEER_REVIEW_TOKEN_TTL_DAYS } from "../constants/peer-review";
import { escapeHtml } from "./emailHtml";
import { sendSijilMail } from "./mailer";

export type ReviewEmailOptions = {
  reviewerName?: string;
  skillName?: string;
};

function buildPlainTextBody(
  learnerName: string,
  evidenceName: string,
  reviewLink: string,
  options?: ReviewEmailOptions,
): string {
  const greeting = options?.reviewerName
    ? `Hello ${options.reviewerName},`
    : "Hello,";

  const lines = [
    greeting,
    "",
    `${learnerName} has requested your peer review on a project in SIJIL.`,
    "",
    `Project: ${evidenceName}`,
  ];

  if (options?.skillName) {
    lines.push(`Skill: ${options.skillName}`);
  }

  lines.push(
    "",
    "Your feedback helps verify this learner's competency with evidence-based trust signals.",
    "",
    "Submit your review here:",
    reviewLink,
    "",
    `This secure link expires in ${PEER_REVIEW_TOKEN_TTL_DAYS} days and can only be used once.`,
    "",
    "— SIJIL · Passive Skill Verification",
  );

  return lines.join("\n");
}

function buildHtmlBody(
  learnerName: string,
  evidenceName: string,
  reviewLink: string,
  options?: ReviewEmailOptions,
): string {
  const greeting = options?.reviewerName
    ? `Hello ${escapeHtml(options.reviewerName)},`
    : "Hello,";
  const safeLearner = escapeHtml(learnerName);
  const safeProject = escapeHtml(evidenceName);
  const safeSkill = options?.skillName ? escapeHtml(options.skillName) : null;
  const safeLink = escapeHtml(reviewLink);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SIJIL Review Request</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">SIJIL</div>
              <div style="font-size:13px;color:#94a3b8;margin-top:4px;">Peer Review Invitation</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                <strong>${safeLearner}</strong> has requested your review on a project they worked on.
                Your feedback helps verify their skills with evidence-based trust signals.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px;">Project</div>
                    <div style="font-size:17px;font-weight:600;color:#0f172a;">${safeProject}</div>
                    ${safeSkill ? `
                    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin:16px 0 8px;">Skill being reviewed</div>
                    <div style="font-size:15px;color:#334155;">${safeSkill}</div>` : ""}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                Please click the button below to open the secure review form and submit your feedback.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#2563eb;">
                    <a href="${safeLink}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Submit Review
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#2563eb;word-break:break-all;">
                <a href="${safeLink}" style="color:#2563eb;">${safeLink}</a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                This link expires in ${PEER_REVIEW_TOKEN_TTL_DAYS} days and can only be used once.
                Only invited reviewers can submit feedback.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                SIJIL · Decentralized Skill Verification Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendReviewRequestEmail(
  to: string,
  learnerName: string,
  evidenceName: string,
  reviewLink: string,
  options?: ReviewEmailOptions,
): Promise<void> {
  const subject = `Review requested: ${evidenceName} — SIJIL`;
  const text = buildPlainTextBody(learnerName, evidenceName, reviewLink, options);
  const html = buildHtmlBody(learnerName, evidenceName, reviewLink, options);

  try {
    await sendSijilMail({
      to,
      subject,
      text,
      html,
      logLabel: "SIJIL Review Email",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    throw new Error(`Failed to send review invitation email: ${message}`);
  }
}

export function buildReviewLink(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/review/request/${token}`;
}

/**
 * Email delivery for existing public verification links.
 * Reuses SIJIL SMTP (Nodemailer). Never logs share tokens.
 */
import { isSmtpConfigured, sendSijilMail, type MailSendResult } from "./mailer";
import { escapeHtml, wrapSijilEmail } from "./emailHtml";

export function buildPublicShareEmailText(input: {
  skillName: string;
  verifyUrl: string;
}): string {
  return [
    "Dear Recipient,",
    "",
    "A SIJIL learner has shared a verified skill credential with you for professional review.",
    "",
    `Credential: ${input.skillName}`,
    "",
    "You can view the selected credential information and verify its authenticity using the secure link below.",
    "",
    input.verifyUrl,
    "",
    "No SIJIL account is required.",
    "",
    "Please note that this link is time-limited and may be revoked by the learner.",
    "",
    "Best regards,",
    "SIJIL Team",
    "Build. Prove. Verify.",
  ].join("\n");
}

export function buildPublicShareEmailHtml(input: {
  skillName: string;
  verifyUrl: string;
}): string {
  const safeSkill = escapeHtml(input.skillName);
  const safeUrl = escapeHtml(input.verifyUrl);
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e293b;">Dear Recipient,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e293b;">
      A SIJIL learner has shared a verified skill credential with you for professional review.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1e293b;">
      <strong>Credential:</strong> ${safeSkill}
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#1e293b;">
      You can view the selected credential information and verify its authenticity using the secure link below.
    </p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#023E8A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">
        View Verified Credential
      </a>
    </p>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;">
      No SIJIL account is required.
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b;">
      Please note that this link is time-limited and may be revoked by the learner.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#1e293b;">
      Best regards,<br />
      SIJIL Team<br />
      <span style="color:#64748b;">Build. Prove. Verify.</span>
    </p>
  `;

  return wrapSijilEmail({
    documentTitle: "Verified Skill Credential Shared via SIJIL",
    subtitle: "Secure credential verification",
    bodyHtml,
  });
}

export async function sendPublicShareEmail(input: {
  recipientEmail: string;
  skillName: string;
  verifyUrl: string;
}): Promise<MailSendResult> {
  if (!isSmtpConfigured()) {
    return { delivered: false };
  }

  return sendSijilMail({
    to: input.recipientEmail,
    subject: "Verified Skill Credential Shared via SIJIL",
    text: buildPublicShareEmailText({
      skillName: input.skillName,
      verifyUrl: input.verifyUrl,
    }),
    html: buildPublicShareEmailHtml({
      skillName: input.skillName,
      verifyUrl: input.verifyUrl,
    }),
    logLabel: "SIJIL Public Share Email",
  });
}

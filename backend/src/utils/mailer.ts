/**
 * Shared Nodemailer SMTP helper used by SIJIL transactional emails.
 * Falls back to console logging when SMTP is not configured.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env";
import { escapeHtml, wrapSijilEmail } from "./emailHtml";
import { safeSmtpFailure, smtpResponseCode } from "./invite-email-delivery";

export { escapeHtml, wrapSijilEmail };

let transporter: Transporter | null = null;
let transporterKey: string | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

export type MailSendResult = {
  delivered: boolean;
};

function getTransporter(): Transporter {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured");
  }
  // Rebuild when host/user/port change after an env update without full process insight.
  const nextKey = `${env.SMTP_HOST}|${env.SMTP_PORT}|${env.SMTP_USER}`;
  if (!transporter || transporterKey !== nextKey) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT === 587,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    transporterKey = nextKey;
  }
  return transporter;
}

export async function sendSijilMail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  logLabel: string;
}): Promise<MailSendResult> {
  const to = params.to.trim();

  if (!isSmtpConfigured()) {
    console.warn(
      `[${params.logLabel}] SMTP not configured — message was not sent.`,
    );
    return { delivered: false };
  }

  const from = env.EMAIL_FROM ?? `SIJIL <${env.SMTP_USER}>`;

  try {
    const info = await getTransporter().sendMail({
      from,
      to,
      bcc: env.SMTP_USER,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(
      `[${params.logLabel}] accepted code=${smtpResponseCode(info.response)}`,
    );
    return { delivered: true };
  } catch (err) {
    console.error(`[${params.logLabel}] not accepted category=${safeSmtpFailure(err)}`);
    throw new Error("Failed to send email");
  }
}

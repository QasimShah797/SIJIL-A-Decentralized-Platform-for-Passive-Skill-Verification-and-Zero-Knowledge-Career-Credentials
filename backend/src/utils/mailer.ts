/**
 * Shared Nodemailer SMTP helper used by SIJIL transactional emails.
 * Falls back to console logging when SMTP is not configured.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env";
import { escapeHtml, wrapSijilEmail } from "./emailHtml";

export { escapeHtml, wrapSijilEmail };

let transporter: Transporter | null = null;

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
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT === 587,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
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
      `[${params.logLabel}] SMTP not configured — set SMTP_USER and SMTP_PASS in backend/.env to send real emails.`,
    );
    console.log(`\n[${params.logLabel} — console fallback]\nTo: ${to}\nSubject: ${params.subject}\n\n${params.text}\n`);
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
      `[${params.logLabel}] Sent to ${to}: ${params.subject} (${info.response ?? "ok"})`,
    );
    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    console.error(`[${params.logLabel}] Failed to send to ${to}:`, message);
    throw new Error(`Failed to send email: ${message}`);
  }
}

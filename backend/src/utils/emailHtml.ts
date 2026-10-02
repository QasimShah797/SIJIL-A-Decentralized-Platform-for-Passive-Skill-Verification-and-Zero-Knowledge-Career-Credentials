/**
 * Shared HTML chrome for SIJIL transactional emails (table layout, SIJIL header).
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapSijilEmail(params: {
  documentTitle: string;
  subtitle: string;
  bodyHtml: string;
}): string {
  const safeTitle = escapeHtml(params.documentTitle);
  const safeSubtitle = escapeHtml(params.subtitle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">SIJIL</div>
              <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${safeSubtitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${params.bodyHtml}
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

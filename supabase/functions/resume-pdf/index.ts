import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import {
  buildAtsResume,
  corsHeaders,
  json,
  loadPresentationByToken,
  parseTokenFromUrl,
  verifyPresentation,
} from "../_shared/public-credential.ts";

function frontendOrigin(): string {
  return (Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const token = parseTokenFromUrl(req, "resume-pdf") ?? new URL(req.url).searchParams.get("shareToken");
  if (!token) return json({ error: "shareToken is required" }, 400);

  const row = await loadPresentationByToken(token);
  if (!row) return json({ error: "Presentation not found" }, 404);
  const verification = await verifyPresentation(row);
  if (verification.status === "revoked") return json({ error: "This credential share has been revoked" }, 410);
  if (verification.status !== "valid") return json({ error: "Resume is not available for this share" }, 409);

  const resume = buildAtsResume(row.disclosed_payload, token, row.competency_id);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([612, 792]);
  let y = 738;

  const write = (text: string, size = 10, face = font) => {
    page.drawText(text.slice(0, 110), { x: 54, y, size, font: face, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  };

  write(resume.name ?? "Learner", 18, bold);
  if (resume.headline) write(String(resume.headline), 10, bold);
  write([resume.contact.location, resume.contact.phone, resume.contact.email].filter(Boolean).join(" | "));
  if (resume.professionalSummary) {
    y -= 6;
    write("SUMMARY", 12, bold);
    write(resume.professionalSummary);
  }
  if (resume.education.length) {
    y -= 6;
    write("EDUCATION", 12, bold);
    for (const item of resume.education) write([item.program, item.institution].filter(Boolean).join(" — "));
  }
  if (resume.skills.length) {
    y -= 6;
    write("SKILLS", 12, bold);
    const origin = frontendOrigin();
    for (const skill of resume.skills) {
      const href = skill.href.startsWith("http") ? skill.href : `${origin}${skill.href}`;
      const width = font.widthOfTextAtSize(skill.name, 10);
      page.drawText(skill.name, { x: 54, y, size: 10, font, color: rgb(0.05, 0.2, 0.45) });
      page.node.addAnnot(doc.context.register(doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [54, y - 2, 54 + width, y + 10],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: href },
      })));
      y -= 14;
    }
  }
  if (resume.certifications.length) {
    y -= 6;
    write("ADDITIONAL INFORMATION", 12, bold);
    for (const item of resume.certifications) write(`Certificates: ${item.name}`);
  }

  const bytes = await doc.save();
  return new Response(bytes, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="sijil-resume.pdf"',
      "Cache-Control": "no-store",
    },
  });
});

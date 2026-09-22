import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AtsResumeView } from "../types/public-credential.types";
import { env } from "../config/env";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const SIDEBAR = 196;
const MAIN_X = 216;
const MAIN_RIGHT = 556;
const NAVY = rgb(0.004, 0.165, 0.361);
const WHITE = rgb(1, 1, 1);
const CREAM = rgb(0.973, 0.957, 0.933);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.53);
const CARD = rgb(1, 1, 1);
const BORDER = rgb(0.89, 0.91, 0.94);

function origin(): string {
  return env.FRONTEND_URL.replace(/\/$/, "");
}

function sourceLabels(skill: AtsResumeView["skills"][number]): string {
  const labels = new Set<string>();
  for (const item of skill.ledger ?? []) {
    if (item.source === "lms" || item.source === "teacher_feedback") labels.add("LMS");
    if (item.source === "github") labels.add("GitHub");
    if (item.source === "practical_task") labels.add("Task");
    if (item.source === "peer_review") labels.add("Reviews");
  }
  return [...labels].join("  ·  ");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

async function embedResumePhoto(doc: PDFDocument, photoUrl?: string) {
  if (!photoUrl) return null;
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 8) return null;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
      || type.includes("png")
      || photoUrl.toLowerCase().includes(".png");
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8
      || type.includes("jpeg")
      || type.includes("jpg")
      || /\.jpe?g(\?|$)/i.test(photoUrl);
    if (isPng) return await doc.embedPng(bytes);
    if (isJpg) return await doc.embedJpg(bytes);
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return await doc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

export async function renderAtsResumePdf(resume: AtsResumeView, shareToken: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const paintChrome = () => {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: CREAM });
    page.drawRectangle({ x: 0, y: 0, width: SIDEBAR, height: PAGE_HEIGHT, color: NAVY });
  };
  paintChrome();

  let sideY = PAGE_HEIGHT - 42;
  let mainY = PAGE_HEIGHT - 48;

  const addPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    paintChrome();
    sideY = PAGE_HEIGHT - 42;
    mainY = PAGE_HEIGHT - 48;
  };

  const wrap = (text: string, size: number, face = font, width = MAIN_RIGHT - MAIN_X): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  const writeSide = (text: string, size: number, face = font, color = WHITE) => {
    for (const line of wrap(text, size, face, SIDEBAR - 36)) {
      if (sideY < 48) addPage();
      page.drawText(line, { x: 18, y: sideY, size, font: face, color });
      sideY -= size + 5;
    }
  };

  const photo = await embedResumePhoto(doc, resume.photoUrl);
  if (photo) {
    page.drawImage(photo, { x: 28, y: sideY - 92, width: 140, height: 140 });
    sideY -= 158;
  } else {
    page.drawRectangle({ x: 28, y: sideY - 52, width: 56, height: 56, color: rgb(0.008, 0.243, 0.541) });
    const mark = initials(resume.name);
    page.drawText(mark, { x: 42, y: sideY - 32, size: 16, font: bold, color: WHITE });
    sideY -= 72;
  }
  writeSide("SIJIL CREDENTIAL", 8, bold, rgb(0.58, 0.77, 0.99));
  sideY -= 4;
  writeSide(resume.name, 16, bold, WHITE);
  if (resume.headline) {
    sideY -= 2;
    writeSide(resume.headline, 9, font, rgb(0.75, 0.86, 1));
  }
  sideY -= 10;
  const contact = [resume.contact.location, resume.contact.phone, resume.contact.email].filter(Boolean);
  for (const item of contact) writeSide(item, 8, font, rgb(0.86, 0.92, 1));

  if (resume.education.length) {
    sideY -= 16;
    writeSide("EDUCATION", 8, bold, rgb(0.58, 0.77, 0.99));
    sideY -= 4;
    for (const item of resume.education) {
      writeSide(item.program || item.institution, 9, bold, WHITE);
      if (item.program && item.institution) writeSide(item.institution, 8, font, rgb(0.75, 0.86, 1));
      if (item.location) writeSide(item.location, 8, font, rgb(0.58, 0.77, 0.99));
      sideY -= 6;
    }
  }

  if (resume.certifications.length) {
    sideY -= 10;
    writeSide("ADDITIONAL INFORMATION", 8, bold, rgb(0.58, 0.77, 0.99));
    sideY -= 4;
    for (const item of resume.certifications) {
      writeSide([item.name, item.issuer].filter(Boolean).join(" · "), 8, font, rgb(0.86, 0.92, 1));
    }
  }

  const writeMain = (text: string, size: number, face = font, color = INK) => {
    for (const line of wrap(text, size, face)) {
      if (mainY < 48) addPage();
      page.drawText(line, { x: MAIN_X, y: mainY, size, font: face, color });
      mainY -= size + 5;
    }
  };

  if (resume.professionalSummary) {
    writeMain("SUMMARY", 9, bold, NAVY);
    mainY -= 4;
    writeMain(resume.professionalSummary, 10.5, font, rgb(0.2, 0.26, 0.33));
    mainY -= 14;
  }

  if (resume.skills.length) {
    writeMain("SKILLS", 9, bold, NAVY);
    mainY -= 8;
    for (const skill of resume.skills) {
      const cardHeight = 46;
      if (mainY - cardHeight < 48) addPage();
      page.drawRectangle({
        x: MAIN_X,
        y: mainY - 32,
        width: MAIN_RIGHT - MAIN_X,
        height: cardHeight,
        color: CARD,
        borderColor: BORDER,
        borderWidth: 1,
      });
      page.drawText(skill.name, { x: MAIN_X + 10, y: mainY - 6, size: 12, font: bold, color: INK });
      const sources = sourceLabels(skill) || "Public evidence available";
      page.drawText(sources, { x: MAIN_X + 10, y: mainY - 22, size: 8, font, color: MUTED });
      const href = skill.href.startsWith("http") ? skill.href : `${origin()}${skill.href}`;
      page.node.addAnnot(
        doc.context.register(
          doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [MAIN_X, mainY - 32, MAIN_RIGHT, mainY + 14],
            Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: href },
          }),
        ),
      );
      mainY -= cardHeight + 10;
    }
  }

  void shareToken;
  return doc.save();
}

import type { LearnerProfileView } from "@/lib/db/learner-profile";
import type { WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import {
  buildAtsResume,
  type AtsResumeView,
} from "@/lib/public-credential";

export function buildWalletResume(
  records: WalletCompetencyRecordView[],
  profile: LearnerProfileView | null | undefined,
  shareToken?: string | null,
  options?: { includePhoto?: boolean },
): AtsResumeView {
  const token = shareToken?.trim() || "wallet";
  const includePhoto = options?.includePhoto !== false;
  const payload: Record<string, unknown> = {
    learner: {
      name: profile?.name,
      institution: profile?.institution,
      program: profile?.program,
      cityCountry: profile?.cityCountry,
      careerGoal: profile?.careerGoal,
      skillsSummary: profile?.skillsSummary,
      photoUrl: includePhoto ? profile?.avatarUrl : undefined,
      photoHidden: !includePhoto,
      contact: {
        email: profile?.email || profile?.universityEmail,
        phone: profile?.contactNumber,
      },
    },
    skills: records
      .filter((record) => record.competencyName?.trim())
      .map((record) => ({
        competencyId: record.competencyId,
        name: record.competencyName,
        domain: record.domain,
        evidenceBacked: record.evidenceCount > 0,
        evidence: {
          github: {
            repos: record.evidencePackage?.github?.repos ?? [],
            activities: record.evidencePackage?.github?.activities ?? [],
            evidenceRecords: record.evidencePackage?.github?.evidenceRecords ?? [],
          },
          lms: {
            courses: record.evidencePackage?.lms?.courses ?? [],
            assignments: record.evidencePackage?.lms?.assignments ?? [],
            evidence: record.evidencePackage?.lms?.evidence ?? [],
            grades: record.evidencePackage?.lms?.grades ?? [],
          },
          practicalTask: record.evidencePackage?.practicalTask ?? {},
          peerReviews: record.evidencePackage?.peerReviews ?? [],
          teacherFeedback: record.evidencePackage?.teacherFeedback ?? [],
        },
      })),
    evidence: {
      github: {
        repos: records.flatMap((record) => record.evidencePackage?.github?.repos ?? []),
      },
      lms: {
        courses: records.flatMap((record) => record.evidencePackage?.lms?.courses ?? []),
        assignments: records.flatMap((record) => record.evidencePackage?.lms?.assignments ?? []),
      },
    },
    credentialMetadata: records.flatMap((record) => record.evidencePackage?.credentialMetadata ?? []),
  };

  return buildAtsResume(payload, token, records[0]?.competencyId ?? null, [
    "lms_evidence",
    "github_evidence",
    "practical_task_result",
    "peer_reviews",
    "teacher_feedback",
    "complete_evidence_package",
  ]);
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(text: string, max = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type PdfLine = {
  text: string;
  heading?: boolean;
  link?: string;
};

function resumeToPdfLines(resume: AtsResumeView): PdfLine[] {
  const lines: PdfLine[] = [];
  lines.push({ text: resume.name, heading: true });
  if (resume.headline) lines.push({ text: resume.headline });
  const contact = [resume.contact.location, resume.contact.phone, resume.contact.email].filter(Boolean).join(" | ");
  if (contact) lines.push({ text: contact });
  lines.push({ text: "" });

  if (resume.professionalSummary) {
    lines.push({ text: "SUMMARY", heading: true });
    wrapLine(resume.professionalSummary).forEach((text) => lines.push({ text }));
    lines.push({ text: "" });
  }

  if (resume.education.length) {
    lines.push({ text: "EDUCATION", heading: true });
    for (const item of resume.education) {
      wrapLine([item.program, item.institution, item.location].filter(Boolean).join(" — "))
        .forEach((text) => lines.push({ text }));
    }
    lines.push({ text: "" });
  }

  if (resume.skills.length) {
    lines.push({ text: "SKILLS", heading: true });
    for (const skill of resume.skills) {
      lines.push({ text: skill.name, link: skill.href });
    }
    lines.push({ text: "" });
  }

  if (resume.certifications.length) {
    lines.push({ text: "ADDITIONAL INFORMATION", heading: true });
    for (const item of resume.certifications) {
      wrapLine(`Certificates: ${[item.name, item.issuer, item.issuedAt].filter(Boolean).join(" — ")}`)
        .forEach((text) => lines.push({ text }));
    }
  }

  return lines;
}

function resolveHref(href: string, origin: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return `${origin.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

export function atsResumeToPdfBlob(resume: AtsResumeView, origin?: string): Blob {
  const publicOrigin = origin
    || (typeof window !== "undefined" ? window.location.origin : "");
  const lines = resumeToPdfLines(resume);
  const pageHeight = 792;
  const pageWidth = 612;
  const margin = 54;
  const lineHeight = 14;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pages: PdfLine[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([{ text: resume.name || "SIJIL Resume", heading: true }]);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    let stream = "BT\n14 TL\n";
    stream += `${margin} ${pageHeight - margin} Td\n`;
    const annots: string[] = [];
    pageLines.forEach((line, index) => {
      const font = line.heading ? "/F2" : "/F1";
      const size = line.heading && index === 0 && pageLines === pages[0] ? 16 : line.heading ? 12 : 10;
      stream += `${font} ${size} Tf (${escapePdf(line.text)}) Tj T*\n`;
      if (line.link && publicOrigin) {
        const y = pageHeight - margin - ((index + 1) * lineHeight) + 2;
        const width = Math.min(pageWidth - margin * 2, Math.max(48, line.text.length * size * 0.5));
        const href = resolveHref(line.link, publicOrigin);
        annots.push(
          `<< /Type /Annot /Subtype /Link /Rect [${margin} ${y} ${margin + width} ${y + lineHeight}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(href)}) >> >>`,
        );
      }
    });
    stream += "ET";
    const contentId = add(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    const annotsRef = annots.length ? ` /Annots [${annots.join(" ")}]` : "";
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R${annotsRef} >>`,
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

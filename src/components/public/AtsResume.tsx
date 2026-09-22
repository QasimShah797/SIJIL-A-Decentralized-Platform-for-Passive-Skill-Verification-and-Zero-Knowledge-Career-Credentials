import { useState } from "react";
import type { AtsResumeSkill, AtsResumeView } from "@/lib/public-credential";

const SOURCE_LABEL: Record<string, string> = {
  lms: "LMS",
  github: "GitHub",
  practical_task: "Task",
  peer_review: "Reviews",
  teacher_feedback: "Faculty",
};

function evidenceLabels(skill: AtsResumeSkill): string[] {
  const seen = new Set<string>();
  for (const item of skill.ledger ?? []) {
    const label = SOURCE_LABEL[item.source] ?? item.trustTierLabel;
    if (label) seen.add(label);
  }
  return [...seen];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

function ResumePhoto({
  name,
  photoUrl,
  fallbackUrl,
}: {
  name: string;
  photoUrl?: string;
  fallbackUrl?: string;
}) {
  const [src, setSrc] = useState(photoUrl || fallbackUrl);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-[#023E8A] text-2xl font-semibold tracking-wide">
        {initials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      className="h-28 w-28 rounded-2xl object-cover ring-4 ring-white/15"
      onError={() => {
        if (fallbackUrl && src !== fallbackUrl) {
          setSrc(fallbackUrl);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

export function AtsResume({
  resume,
  verified = false,
  photoFallbackUrl,
}: {
  resume: AtsResumeView;
  verified?: boolean;
  photoFallbackUrl?: string;
}) {
  const contact = [
    resume.contact.location,
    resume.contact.phone,
    resume.contact.email,
  ].filter(Boolean);

  return (
    <article className="mx-auto grid max-w-[880px] overflow-hidden rounded-3xl bg-[#f7f4ee] shadow-[0_24px_60px_rgba(2,32,71,0.18)] md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="bg-[#012A5C] px-7 py-8 text-white">
        <ResumePhoto
          name={resume.name}
          photoUrl={resume.photoUrl}
          fallbackUrl={photoFallbackUrl}
        />
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#93c5fd]">
          SIJIL credential
        </p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold leading-tight">
          {resume.name}
        </h1>
        {resume.headline ? (
          <p className="mt-2 text-sm text-[#bfdbfe]">{resume.headline}</p>
        ) : null}
        {verified ? (
          <p className="mt-4 inline-flex rounded-full bg-[#064e3b] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6ee7b7]">
            Verified share
          </p>
        ) : null}

        {contact.length > 0 ? (
          <ul className="mt-8 space-y-2 text-[13px] text-[#dbeafe]">
            {contact.map((item) => (
              <li key={item} className="break-words">{item}</li>
            ))}
          </ul>
        ) : null}

        {resume.education.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#93c5fd]">
              EDUCATION
            </h2>
            <div className="mt-3 space-y-3">
              {resume.education.map((item) => (
                <div key={item.institution}>
                  <p className="text-sm font-semibold">{item.program || item.institution}</p>
                  {item.program && item.institution ? (
                    <p className="text-[12px] text-[#bfdbfe]">{item.institution}</p>
                  ) : null}
                  {item.location ? (
                    <p className="text-[12px] text-[#93c5fd]">{item.location}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.certifications.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#93c5fd]">
              ADDITIONAL INFORMATION
            </h2>
            <ul className="mt-3 space-y-2 text-[13px] text-[#dbeafe]">
              {resume.certifications.map((item) => (
                <li key={item.name}>
                  {[item.name, item.issuer].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      <div className="px-6 py-8 sm:px-9">
        {resume.professionalSummary ? (
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#023E8A]">
              SUMMARY
            </h2>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-7 text-[#334155]">
              {resume.professionalSummary}
            </p>
          </section>
        ) : null}

        {resume.skills.length > 0 ? (
          <section className={resume.professionalSummary ? "mt-8" : undefined}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#023E8A]">
              SKILLS
            </h2>
            <p className="mt-1 text-[12px] text-[#64748b]">
              Click a competency to open its public evidence ledger.
            </p>
            <ul className="mt-4 grid gap-3">
              {resume.skills.map((skill) => {
                const sources = evidenceLabels(skill);
                return (
                  <li key={`${skill.competencyId}-${skill.name}`}>
                    <a
                      href={skill.href}
                      className="block rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[#023E8A] hover:shadow-md"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span data-skill-name className="text-[17px] font-semibold text-[#0f172a]">
                          {skill.name}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-[#023E8A]">
                          View evidence →
                        </span>
                      </span>
                      {sources.length > 0 ? (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {sources.map((source) => (
                            <span
                              key={source}
                              className="rounded-full bg-[#e8eef7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#023E8A]"
                            >
                              {source}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="mt-2 block text-[12px] text-[#94a3b8]">
                          Evidence page available
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

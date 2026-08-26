import {
  BookOpen,
  ClipboardCheck,
  Github,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingCard,
  landingContainer,
  landingSection,
} from "@/components/landing/landing-styles";

type EvidenceRow = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const evidenceRows: EvidenceRow[] = [
  {
    icon: Github,
    title: "GitHub Activity",
    description: "Repositories, commits, pull requests, contributors, and available reviews.",
  },
  {
    icon: BookOpen,
    title: "Moodle LMS",
    description: "Courses, assignments, grades, submissions, and instructor feedback.",
  },
  {
    icon: ClipboardCheck,
    title: "Practical Validation",
    description: "Timed competency tasks with recorded answers, scores, and attempt history.",
  },
  {
    icon: MessageSquare,
    title: "Contextual Reviews",
    description: "Feedback from reviewers connected to the same repository or learning context.",
  },
];

export function EvidenceWalletSection() {
  return (
    <section id="evidence" className={landingSection}>
      <div className={landingContainer}>
        <ScrollReveal>
          <SectionHeading
            title="One competency. One structured evidence record."
            description="Repositories, coursework, practical submissions, and reviews stay connected to the competency they support."
          />
        </ScrollReveal>

        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
          <ScrollReveal>
            <ul className="space-y-4">
              {evidenceRows.map((row) => {
                const Icon = row.icon;
                return (
                  <li
                    key={row.title}
                    className="flex gap-4 rounded-[1.125rem] border border-border/50 bg-card p-4 transition-shadow hover:shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{row.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <div id="wallet" className="scroll-mt-[4.25rem]">
              <div className={`${landingCard} credential-foil overflow-hidden p-6 text-primary-foreground sm:p-7`}>
                <div className="border-b border-white/15 pb-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Digital credential</p>
                  <p className="mt-1 text-xl font-semibold">TypeScript</p>
                  <p className="text-sm text-primary-foreground/75">Software Development</p>
                </div>

                <dl className="mt-4 space-y-2.5 text-sm">
                  {[
                    ["Evidence count", "12"],
                    ["Practical task", "Submitted"],
                    ["Task score", "80%"],
                    ["Context reviews", "4"],
                    ["Verification", "Passed"],
                    ["Record status", "Wallet-ready"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <dt className="text-primary-foreground/75">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <span className="inline-flex h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-medium backdrop-blur-sm" aria-hidden="true">
                    View evidence
                  </span>
                  <span className="inline-flex h-10 items-center justify-center rounded-xl bg-white/95 px-4 text-xs font-medium text-primary" aria-hidden="true">
                    Share selectively
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                A wallet record is created after a practical-task submission and remains connected to the
                competency evidence history.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

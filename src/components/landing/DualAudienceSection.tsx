import { Link } from "react-router-dom";
import { Briefcase, GraduationCap, Search, Share2, Wallet } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingBtnPrimary,
  landingBtnSecondary,
  landingCard,
  landingContainer,
  landingSection,
} from "@/components/landing/landing-styles";

const learnerPoints = [
  { icon: GraduationCap, text: "Declare competencies and connect GitHub + LMS evidence" },
  { icon: Wallet, text: "Build a credential wallet you control" },
  { icon: Share2, text: "Share selectively with time-limited verification links" },
] as const;

const recruiterPoints = [
  { icon: Search, text: "Search candidates with structured competency records" },
  { icon: Briefcase, text: "Verify disclosed evidence — not self-reported claims" },
  { icon: Share2, text: "Review signed presentations with proof metadata" },
] as const;

export function DualAudienceSection() {
  return (
    <section className={landingSection} id="for-everyone">
      <div className={landingContainer}>
        <ScrollReveal>
          <SectionHeading
            eyebrow="Built for both sides"
            title="One platform. Two trusted workspaces."
            description="Learners build verifiable professional identity. Recruiters verify what candidates choose to share — with confidence in the evidence chain."
          />
        </ScrollReveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <ScrollReveal>
            <article className={`${landingCard} flex h-full flex-col p-6 sm:p-8`}>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">For learners</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Free to join. Build one trusted career profile from real evidence — repositories,
                coursework, practical tasks, and contextual reviews.
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {learnerPoints.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/signup/learner" className={`${landingBtnPrimary} mt-8 w-full sm:w-auto`}>
                Get started — free
              </Link>
            </article>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <article className={`${landingCard} flex h-full flex-col border-primary/20 p-6 sm:p-8`}>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-info/10 text-info">
                <Briefcase className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">For recruiters</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Access candidates with verified evidence packages. Review selective disclosures
                with cryptographic verification — enterprise-grade trust, developer-simple flow.
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {recruiterPoints.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/login/recruiter" className={`${landingBtnSecondary} mt-8 w-full sm:w-auto`}>
                Recruiter sign in
              </Link>
            </article>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

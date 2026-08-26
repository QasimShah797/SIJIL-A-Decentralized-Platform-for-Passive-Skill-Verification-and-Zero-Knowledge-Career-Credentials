import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingBtnPrimary,
  landingBtnSecondary,
  landingCard,
  landingContainer,
  landingSection,
} from "@/components/landing/landing-styles";
import { scrollToSection } from "@/components/landing/useActiveSection";

const evidenceRows = [
  { label: "GitHub", value: "3 repositories" },
  { label: "Moodle LMS", value: "2 course records" },
  { label: "Practical Task", value: "80%" },
  { label: "Context Reviews", value: "4" },
] as const;

export function HeroSection() {
  return (
    <section id="home" className={landingSection}>
      <div className={landingContainer}>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-16">
          <ScrollReveal>
            <div className="max-w-xl">
              <p className="mb-4 inline-flex rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-semibold tracking-wide text-primary">
                Verification-first professional identity
              </p>
              <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[3.25rem] lg:leading-[1.08]">
                Unlock the power of{" "}
                <span className="text-primary">verified skills</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                SIJIL connects learning activity, practical validation, and peer context into
                digital credentials you own — then share selectively with recruiters who need proof, not promises.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/signup/learner" className={landingBtnPrimary}>
                  Get Started as Learner
                </Link>
                <Link to="/login/recruiter" className={landingBtnSecondary}>
                  Recruiter Sign In
                </Link>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Learner-owned records · Context-aware evidence · Selective sharing
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div
                className="pointer-events-none absolute -inset-4 rounded-[1.5rem] bg-[linear-gradient(135deg,hsl(var(--primary)/0.04),hsl(var(--info)/0.03))] sm:-inset-6"
                aria-hidden="true"
              />
              <div className={`${landingCard} credential-foil relative overflow-hidden p-6 text-primary-foreground sm:p-7`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.12),transparent_50%)]" aria-hidden />
                <div className="relative flex items-start justify-between gap-3 border-b border-white/15 pb-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
                      Digital Credential
                    </p>
                    <p className="mt-1 text-xl font-semibold">TypeScript</p>
                    <p className="text-sm text-primary-foreground/75">Software Development</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    Verified
                  </span>
                </div>

                <ul className="relative mt-4 space-y-2.5">
                  {evidenceRows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-sm"
                    >
                      <span className="text-primary-foreground/75">{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </li>
                  ))}
                </ul>

                <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-white/15 pt-4">
                  <p className="text-sm text-primary-foreground/75">W3C verifiable · Learner-owned</p>
                  <span
                    className="inline-flex h-9 items-center rounded-xl bg-white/15 px-3.5 text-xs font-medium backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    View Credential
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

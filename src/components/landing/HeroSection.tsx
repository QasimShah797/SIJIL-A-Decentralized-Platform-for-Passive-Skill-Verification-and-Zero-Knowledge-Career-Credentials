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
              <p className="mb-4 inline-flex rounded-full border border-border/70 bg-muted/40 px-3.5 py-1 text-xs font-medium tracking-wide text-muted-foreground">
                Evidence-backed competency records
              </p>
              <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[3.5rem] lg:leading-[1.08]">
                Turn real learning and project work into trusted competency records.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                SIJIL brings together GitHub activity, Moodle learning evidence, practical tasks,
                and contextual reviews under each competency—then lets learners share only what they
                choose.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/" className={landingBtnPrimary}>
                  Get Started
                </Link>
                <button
                  type="button"
                  onClick={() => scrollToSection("#how-it-works")}
                  className={landingBtnSecondary}
                >
                  See How It Works
                </button>
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
              <div className={`${landingCard} relative p-6 sm:p-7`}>
                <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Competency Record
                    </p>
                    <p className="mt-1 text-xl font-semibold">TypeScript</p>
                    <p className="text-sm text-muted-foreground">Software Development</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Evidence Updated
                  </span>
                </div>

                <ul className="mt-4 space-y-2.5">
                  {evidenceRows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
                  <p className="text-sm text-muted-foreground">Ready for selective sharing</p>
                  <span
                    className="inline-flex h-9 items-center rounded-xl border border-border/60 bg-muted/30 px-3.5 text-xs font-medium text-muted-foreground"
                    aria-hidden="true"
                  >
                    View Record
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

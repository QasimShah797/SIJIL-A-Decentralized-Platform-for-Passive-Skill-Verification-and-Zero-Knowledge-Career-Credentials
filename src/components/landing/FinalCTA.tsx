import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingBtnPrimary,
  landingContainer,
  landingSection,
} from "@/components/landing/landing-styles";

export function FinalCTA() {
  return (
    <section className={landingSection}>
      <div className={landingContainer}>
        <ScrollReveal>
          <div className="landing-cta rounded-[1.25rem] border border-border/50 px-6 py-10 text-center sm:px-10 sm:py-12">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Build a competency record backed by real evidence.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground">
              Create your learner profile, connect evidence, complete validation, and share your progress
              with confidence.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/" className={landingBtnPrimary}>
                Get Started
              </Link>
              <Link
                to="/"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                Sign In
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

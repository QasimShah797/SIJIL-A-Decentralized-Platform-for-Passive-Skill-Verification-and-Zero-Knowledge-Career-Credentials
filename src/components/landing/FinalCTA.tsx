import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingBtnPrimary,
  landingBtnSecondary,
  landingContainer,
  landingSection,
} from "@/components/landing/landing-styles";

export function FinalCTA() {
  return (
    <section className={landingSection}>
      <div className={landingContainer}>
        <ScrollReveal>
          <div className="landing-cta rounded-[1.25rem] border border-border/50 px-6 py-10 text-center sm:px-10 sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Ready to get started?</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Build a competency record backed by real evidence.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground">
              Join SIJIL — connect evidence, earn verifiable credentials, and share with recruiters
              who need proof, not promises.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup/learner" className={landingBtnPrimary}>
                Get started — free
              </Link>
              <Link to="/login/recruiter" className={landingBtnSecondary}>
                Recruiter sign in
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

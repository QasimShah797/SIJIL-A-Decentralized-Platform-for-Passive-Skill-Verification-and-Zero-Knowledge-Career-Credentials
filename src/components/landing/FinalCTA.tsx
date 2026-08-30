import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export function FinalCTA() {
  return (
    <section id="cta" className="landing-section bg-white">
      <div className="landing-container">
        <ScrollReveal>
          <div className="lp-cta-banner px-8 py-12 sm:px-14 sm:py-16">
            <div className="relative z-10 max-w-lg">
              <h2 className="text-2xl font-extrabold leading-snug text-white sm:text-3xl">
                Your skills deserve more than a line on a resume.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                Issue professional digital credentials with SIJIL — backed by evidence employers can verify instantly.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/signup/learner"
                  className="inline-flex h-11 items-center rounded-lg bg-white px-6 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Get Started
                </Link>
                <button
                  type="button"
                  className="inline-flex h-11 items-center rounded-lg border border-white/30 px-6 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Contact Us
                </button>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

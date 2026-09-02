import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { scrollToAboutSection } from "@/components/about/about-scroll";

export function AboutFinalCTA() {
  return (
    <section className="about-section-sm about-bg-subtle" aria-labelledby="about-final-cta-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-final-cta">
            <div className="about-final-cta-glow" aria-hidden />
            <h2 id="about-final-cta-heading">
              Your work is the proof.
              <br />
              SIJIL aggregates it into credentials.
            </h2>
            <p>
              Build a professional identity backed by real evidence, practical assessment, and
              assembled credentials.
            </p>
            <div className="about-final-cta-actions">
              <Link to="/signup/learner" className="about-btn-primary about-focus-ring">
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                className="about-btn-ghost-light about-focus-ring"
                onClick={() => scrollToAboutSection("#how-it-works")}
              >
                Explore SIJIL
              </button>
            </div>
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

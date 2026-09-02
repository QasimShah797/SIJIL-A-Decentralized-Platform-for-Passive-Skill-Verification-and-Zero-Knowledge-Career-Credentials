import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutHeroProduct } from "@/components/about/AboutMocks";
import { scrollToAboutSection } from "@/components/about/about-scroll";

export function AboutHero() {
  return (
    <section id="hero" className="about-hero">
      <div className="about-container">
        <div className="about-hero-grid">
          <AboutScrollReveal>
            <div className="about-hero-eyebrow-line">
              <p className="about-eyebrow">Professional Skill Evidence</p>
            </div>
            <h1 className="about-hero-headline">
              Prove what you can do.
              <br />
              <em>Build what you can prove.</em>
            </h1>
            <p className="about-hero-support">
              SIJIL aggregates real work, practical assessments, and professional evidence into a
              unified competency record — helping professionals build a trusted digital identity
              based on proof.
            </p>
            <div className="about-hero-actions">
              <Link to="/signup/learner" className="about-btn-primary about-focus-ring">
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                className="about-btn-secondary about-focus-ring"
                onClick={() => scrollToAboutSection("#how-it-works")}
              >
                See How SIJIL Works
              </button>
            </div>
            <div className="about-hero-trust-line">
              {["Evidence-backed", "Assessment-supported", "Credential-ready"].map((item, i) => (
                <span key={item} className="about-hero-trust-item">
                  {i > 0 && <span className="about-hero-trust-dot" aria-hidden>•</span>}
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {item}
                </span>
              ))}
            </div>
          </AboutScrollReveal>

          <AboutScrollReveal delay={120}>
            <AboutHeroProduct />
          </AboutScrollReveal>
        </div>
      </div>
    </section>
  );
}

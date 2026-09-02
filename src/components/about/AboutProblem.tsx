import { Check, X } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";

const TRADITIONAL = ["Skills listed", "Self-reported", "Limited evidence", "Difficult to validate"];
const SIJIL = ["Evidence-backed", "Assessment-supported", "Evidence trail", "Professional credential"];

export function AboutProblem() {
  return (
    <section className="about-section about-bg-subtle" aria-labelledby="about-problem-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <p className="about-eyebrow">The Problem</p>
          <h2 id="about-problem-heading" className="about-heading max-w-2xl">
            A résumé tells people what you claim.
            <br />
            Evidence shows what you can do.
          </h2>

          <div className="about-problem-grid">
            <div className="about-problem-panel about-problem-traditional">
              <p className="about-problem-panel-label about-problem-panel-label-muted">
                Traditional Profile
              </p>
              <ul className="about-problem-list">
                {TRADITIONAL.map((item) => (
                  <li key={item} className="about-problem-row">
                    <X className="h-4 w-4 shrink-0 about-icon-muted" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="about-problem-vs" aria-hidden>
              VS
            </div>

            <div className="about-problem-panel about-problem-sijil">
              <p className="about-problem-panel-label about-problem-panel-label-brand">SIJIL</p>
              <ul className="about-problem-list">
                {SIJIL.map((item) => (
                  <li key={item} className="about-problem-row">
                    <Check className="h-4 w-4 shrink-0 about-icon-teal" aria-hidden />
                    <strong>{item}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

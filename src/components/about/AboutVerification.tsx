import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutVerificationPanel } from "@/components/about/AboutVerificationPanel";

const POINTS = [
  "Every competency follows a clear evidence aggregation pipeline",
  "Evidence and assessments are linked transparently from source systems",
  "Aggregation status is visible at every stage",
  "Credentials reflect assembled proof — not platform-side verification",
] as const;

export function AboutVerification() {
  return (
    <section
      id="evidence-trail"
      className="about-section about-trail-section"
      aria-labelledby="about-evidence-trail-heading"
    >
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-trail-layout">
            <AboutVerificationPanel />

            <div className="about-trail-content">
              <p className="about-eyebrow">Evidence Trail</p>
              <h2 id="about-evidence-trail-heading" className="about-heading">
                A skill is stronger when it has a trail behind it.
              </h2>
              <p className="about-subheading">
                SIJIL aggregates competency declarations with supporting evidence and assessments —
                building a transparent trail of proof without SIJIL acting as the verifier.
              </p>

              <ul className="about-trail-points">
                {POINTS.map((point, index) => (
                  <li key={point} className="about-trail-point">
                    <span className="about-trail-point-num">{String(index + 1).padStart(2, "0")}</span>
                    <span className="about-trail-point-text">{point}</span>
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

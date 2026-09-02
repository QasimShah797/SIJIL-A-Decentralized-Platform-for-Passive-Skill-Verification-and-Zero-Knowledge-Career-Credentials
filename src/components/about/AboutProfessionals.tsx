import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";

const BENEFITS = [
  {
    num: "01",
    title: "Prove real capabilities",
    desc: "Demonstrate skills with linked evidence from actual work — not just listed keywords.",
  },
  {
    num: "02",
    title: "Show evidence behind your work",
    desc: "Connect GitHub, practical tasks, projects, and assessments to your competency claims.",
  },
  {
    num: "03",
    title: "Build a portable professional identity",
    desc: "Create an evidence-backed identity you control and share selectively with employers.",
  },
  {
    num: "04",
    title: "Create evidence-backed credentials",
    desc: "Earn credentials assembled from a transparent evidence trail — not self-assertion.",
  },
] as const;

export function AboutProfessionals() {
  return (
    <section
      id="for-professionals"
      className="about-section about-bg-subtle"
      aria-labelledby="about-professionals-heading"
    >
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-professionals-layout">
            <div>
              <p className="about-eyebrow">For Professionals</p>
              <h2 id="about-professionals-heading" className="about-heading">
                Make your skills easier to trust.
              </h2>
              <p className="about-subheading">
                SIJIL helps professionals move beyond résumé claims to evidence-backed proof of
                competency.
              </p>
              <Link
                to="/signup/learner"
                className="about-btn-primary about-focus-ring mt-8 inline-flex"
              >
                Build Your Professional Identity
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="about-benefit-list">
              {BENEFITS.map(({ num, title, desc }) => (
                <div key={num} className="about-benefit-row">
                  <span className="about-benefit-num">{num}</span>
                  <div>
                    <p className="about-benefit-title">{title}</p>
                    <p className="about-benefit-desc">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

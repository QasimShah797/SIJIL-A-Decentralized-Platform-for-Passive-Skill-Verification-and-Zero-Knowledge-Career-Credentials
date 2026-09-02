import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";

const STEPS = [
  {
    num: "01",
    title: "Declare",
    desc: "Declare a competency you want to prove.",
    state: "done" as const,
  },
  {
    num: "02",
    title: "Provide Evidence",
    desc: "Connect projects, repositories, practical work and other evidence.",
    state: "done" as const,
  },
  {
    num: "03",
    title: "Assess",
    desc: "Demonstrate the competency through practical assessment.",
    state: "active" as const,
  },
  {
    num: "04",
    title: "Aggregate",
    desc: "SIJIL aggregates evidence and assessments into a unified proof record.",
    state: "pending" as const,
  },
  {
    num: "05",
    title: "Credential",
    desc: "Build a professional credential from aggregated evidence.",
    state: "pending" as const,
  },
] as const;

type StepState = (typeof STEPS)[number]["state"];

function stepStateClass(state: StepState) {
  return `about-pipeline-step about-pipeline-step--${state}`;
}

function markerClass(state: StepState) {
  return `about-pipeline-marker about-pipeline-marker--${state}`;
}

export function AboutHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="about-section about-how-section"
      aria-labelledby="about-how-heading"
    >
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-how-header">
            <p className="about-eyebrow">How SIJIL Works</p>
            <h2 id="about-how-heading" className="about-heading">
              From declaration to evidence-backed proof
            </h2>
            <p className="about-subheading">
              A structured pipeline that aggregates real work into trusted professional credentials.
            </p>
          </div>

          <div className="about-pipeline-panel">
            <div className="about-pipeline-panel-glow" aria-hidden />

            <div className="about-pipeline-desktop">
              <div className="about-pipeline-rail" aria-hidden>
                <div className="about-pipeline-rail-fill" />
              </div>
              <ol className="about-pipeline-steps">
                {STEPS.map((step) => (
                  <li key={step.num} className={stepStateClass(step.state)}>
                    <div className={markerClass(step.state)}>
                      <span>{step.num}</span>
                    </div>
                    <div className="about-pipeline-card">
                      <h3 className="about-pipeline-title">{step.title}</h3>
                      <p className="about-pipeline-desc">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <ol className="about-pipeline-mobile">
              {STEPS.map((step, index) => (
                <li key={step.num} className={`about-pipeline-mobile-item about-pipeline-step--${step.state}`}>
                  <div className="about-pipeline-mobile-rail">
                    <div className={markerClass(step.state)}>
                      <span>{step.num}</span>
                    </div>
                    {index < STEPS.length - 1 && <div className="about-pipeline-mobile-line" aria-hidden />}
                  </div>
                  <div className="about-pipeline-card">
                    <h3 className="about-pipeline-title">{step.title}</h3>
                    <p className="about-pipeline-desc">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

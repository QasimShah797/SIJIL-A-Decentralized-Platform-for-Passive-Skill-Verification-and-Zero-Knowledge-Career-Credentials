import { Check, Circle, GitBranch, FileCode, ClipboardCheck } from "lucide-react";

const STEPS = [
  { label: "Declared", state: "done" as const },
  { label: "Evidence Linked", state: "done" as const },
  { label: "Assessment", state: "done" as const },
  { label: "Aggregation", state: "active" as const },
  { label: "Credential", state: "pending" as const },
];

const EVIDENCE = [
  { label: "GitHub", icon: GitBranch },
  { label: "Practical Submission", icon: FileCode },
  { label: "Assessment", icon: ClipboardCheck },
];

export function AboutVerificationPanel() {
  return (
    <div className="about-trail-mock">
      <div className="about-trail-mock-glow" aria-hidden />
      <div className="about-trail-mock-inner">
        <div className="about-trail-mock-header">
          <div className="about-trail-mock-chrome">
            <span className="about-mock-dot" />
            <span className="about-mock-dot" />
            <span className="about-mock-dot" />
            <span className="about-trail-mock-label">Evidence Trail</span>
          </div>
          <div className="about-trail-mock-competency">
            <p className="about-trail-mock-skill">TypeScript</p>
            <p className="about-trail-mock-domain">Frontend Development</p>
          </div>
        </div>

        <div className="about-trail-mock-body">
          <p className="about-trail-mock-section-label">Aggregation pipeline</p>
          <ol className="about-trail-mock-steps">
            {STEPS.map((step, index) => (
              <li
                key={step.label}
                className={`about-trail-mock-step about-trail-mock-step--${step.state}`}
              >
                <div className="about-trail-mock-step-rail">
                  <span className={`about-trail-mock-step-icon about-trail-mock-step-icon--${step.state}`}>
                    {step.state === "done" ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : (
                      <Circle className="h-2.5 w-2.5" fill="currentColor" />
                    )}
                  </span>
                  {index < STEPS.length - 1 && (
                    <span className="about-trail-mock-step-line" aria-hidden />
                  )}
                </div>
                <span className="about-trail-mock-step-label">{step.label}</span>
              </li>
            ))}
          </ol>

          <div className="about-trail-mock-evidence">
            <p className="about-trail-mock-section-label">Supporting evidence</p>
            <div className="about-trail-mock-tags">
              {EVIDENCE.map(({ label, icon: Icon }) => (
                <span key={label} className="about-trail-mock-tag">
                  <Icon className="h-3 w-3" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

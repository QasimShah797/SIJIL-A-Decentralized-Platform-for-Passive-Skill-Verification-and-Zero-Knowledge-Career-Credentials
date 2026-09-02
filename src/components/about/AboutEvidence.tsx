import { FileCode, FolderGit2, GitBranch, ClipboardCheck, Users } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutEvidencePanel } from "@/components/about/AboutMocks";

const SOURCES = [
  { icon: GitBranch, label: "GitHub" },
  { icon: ClipboardCheck, label: "Practical Submissions" },
  { icon: FolderGit2, label: "Projects" },
  { icon: FileCode, label: "Assessments" },
  { icon: Users, label: "Peer Reviews" },
];

const FLOW = ["Real Work", "Evidence", "Assessment", "Aggregation", "Proof"];

export function AboutEvidence() {
  return (
    <section className="about-section about-bg-white" aria-labelledby="about-evidence-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-evidence-layout">
            <div>
              <p className="about-eyebrow">Evidence</p>
              <h2 id="about-evidence-heading" className="about-heading">
                Your work becomes evidence.
              </h2>
              <p className="about-subheading">
                Connect repositories, practical submissions, projects, and peer reviews into a
                structured evidence record that supports your competency claims.
              </p>

              <div className="about-evidence-sources">
                {SOURCES.map(({ icon: Icon, label }) => (
                  <span key={label} className="about-evidence-source">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>

              <div className="about-evidence-flow mt-8">
                {FLOW.map((step, i) => (
                  <div key={step}>
                    <div className="about-evidence-flow-step">{step}</div>
                    {i < FLOW.length - 1 && (
                      <span className="ml-3 text-[#94A3B8]" aria-hidden>
                        ↓
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <AboutEvidencePanel />
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

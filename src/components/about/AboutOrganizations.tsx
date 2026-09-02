import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutOrgsVerificationMini } from "@/components/about/AboutMocks";

const FLOW = ["Candidate", "Evidence", "Assessment", "Aggregation", "Confidence"];

const WORKPLACE_IMG =
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80&auto=format&fit=crop";

export function AboutOrganizations() {
  return (
    <section
      id="for-organizations"
      className="about-section about-bg-white"
      aria-labelledby="about-orgs-heading"
    >
      <div className="about-container">
        <AboutScrollReveal>
          <div className="about-orgs-layout">
            <div>
              <img
                src={WORKPLACE_IMG}
                alt="Professional team collaborating on a technology project in a modern workplace"
                className="about-orgs-image"
                loading="lazy"
                width={800}
                height={600}
              />
            </div>

            <div>
              <p className="about-eyebrow">For Organizations</p>
              <h2 id="about-orgs-heading" className="about-heading">
                Hire based on proof, not just claims.
              </h2>
              <p className="about-subheading">
                Organizations can evaluate competency using aggregated, evidence-backed records
                instead of relying only on résumé claims.
              </p>

              <div className="about-orgs-flow">
                {FLOW.map((item, i) => (
                  <div key={item}>
                    <div className="about-orgs-flow-item">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#063B82] text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      {item}
                    </div>
                    {i < FLOW.length - 1 && (
                      <ArrowDown className="ml-3 h-4 w-4 text-[#94A3B8]" aria-hidden />
                    )}
                  </div>
                ))}
              </div>

              <Link
                to="/login/recruiter"
                className="about-btn-primary about-focus-ring mt-8 inline-flex"
              >
                Explore Evidence Trail
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>

              <AboutOrgsVerificationMini />
            </div>
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

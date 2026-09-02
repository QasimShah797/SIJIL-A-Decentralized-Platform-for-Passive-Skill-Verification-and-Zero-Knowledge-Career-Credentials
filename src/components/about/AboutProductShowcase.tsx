import { useState } from "react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutShowcasePreview } from "@/components/about/AboutMocks";

const TABS = [
  { id: "competencies" as const, label: "Competencies" },
  { id: "evidence" as const, label: "Evidence Records" },
  { id: "validation" as const, label: "Evidence Trail" },
  { id: "profile" as const, label: "Professional Profile" },
  { id: "wallet" as const, label: "Digital Wallet" },
];

export function AboutProductShowcase() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("competencies");

  return (
    <section className="about-section about-bg-subtle" aria-labelledby="about-showcase-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <p className="about-eyebrow">Product</p>
          <h2 id="about-showcase-heading" className="about-heading">
            One professional identity.
            <br />A complete trail of proof.
          </h2>
          <p className="about-subheading">
            Explore how SIJIL connects competencies, evidence, aggregation, and portable
            credentials into a single professional identity.
          </p>

          <div className="about-showcase-tabs" role="tablist" aria-label="Product previews">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active === tab.id}
                className={`about-showcase-tab about-focus-ring ${active === tab.id ? "about-showcase-tab-active" : ""}`}
                onClick={() => setActive(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="about-showcase-preview" role="tabpanel">
            <AboutShowcasePreview tab={active} />
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

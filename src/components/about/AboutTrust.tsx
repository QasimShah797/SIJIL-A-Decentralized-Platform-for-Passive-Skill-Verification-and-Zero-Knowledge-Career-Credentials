import { Award, ClipboardCheck, ShieldCheck, Wallet } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";

const ITEMS = [
  {
    icon: Award,
    title: "Real Work",
    desc: "Evidence from actual projects",
  },
  {
    icon: ClipboardCheck,
    title: "Practical Assessment",
    desc: "Demonstrate what you can do",
  },
  {
    icon: ShieldCheck,
    title: "Evidence Trail",
    desc: "Aggregated proof from connected sources",
  },
  {
    icon: Wallet,
    title: "Digital Credential",
    desc: "Portable professional proof",
  },
] as const;

export function AboutTrust() {
  return (
    <section className="about-trust-strip" aria-labelledby="about-trust-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <h2 id="about-trust-heading" className="about-trust-strip-heading">
            Built around proof, not claims.
          </h2>
          <div className="about-trust-grid mt-10">
            {ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="about-trust-grid-item">
                <div className="about-trust-icon">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <p className="about-trust-item-title">{title}</p>
                <p className="about-trust-item-desc">{desc}</p>
              </div>
            ))}
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

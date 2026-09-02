import { BadgeCheck, Fingerprint, ShieldCheck, Share2 } from "lucide-react";
import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";

const PILLARS = [
  { icon: ShieldCheck, label: "Evidence-backed" },
  { icon: ShieldCheck, label: "Transparent evidence trail" },
  { icon: Share2, label: "Portable credentials" },
  { icon: Fingerprint, label: "Professional identity" },
] as const;

export function AboutSocialTrust() {
  return (
    <section className="about-social-trust" aria-labelledby="about-trust-pillars-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <h2
            id="about-trust-pillars-heading"
            className="text-center text-lg font-semibold text-[#64748B]"
          >
            Built on principles of trust and evidence aggregation
          </h2>
          <div className="about-social-pills">
            {PILLARS.map(({ icon: Icon, label }) => (
              <span key={label} className="about-social-pill">
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

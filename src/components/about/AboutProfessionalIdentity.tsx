import { AboutScrollReveal } from "@/components/about/AboutScrollReveal";
import { AboutIdentityCard } from "@/components/about/AboutMocks";

export function AboutProfessionalIdentity() {
  return (
    <section className="about-section about-bg-white" aria-labelledby="about-identity-heading">
      <div className="about-container">
        <AboutScrollReveal>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="about-eyebrow">Digital Identity</p>
              <h2 id="about-identity-heading" className="about-heading">
                Turn your work into a professional identity.
              </h2>
              <p className="about-subheading">
                Build a portable, evidence-backed professional identity — not self-reported claims.
                Share only what you choose, when you choose.
              </p>
              <p className="mt-6 text-sm leading-relaxed text-[#64748B]">
                Your SIJIL identity connects aggregated competencies, evidence records, and digital
                credentials into a single professional profile — secured with decentralized identity
                technology.
              </p>
            </div>
            <AboutIdentityCard />
          </div>
        </AboutScrollReveal>
      </div>
    </section>
  );
}

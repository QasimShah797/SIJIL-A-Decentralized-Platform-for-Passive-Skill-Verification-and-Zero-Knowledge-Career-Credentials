import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { VerifiedSkillsCardMock } from "@/components/landing/LandingMocks";

const sources = [
  ["Online courses", "Degrees & diplomas"],
  ["Work history", "GitHub projects"],
  ["Certifications", "Peer reviews"],
  ["Practical tasks", "LMS assignments"],
];

export function DualAudienceSection() {
  return (
    <section id="how-it-works" className="landing-section bg-white">
      <div className="landing-container">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <ScrollReveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Turn what you learn into proof.
            </h2>
            <p className="mt-4 leading-relaxed text-gray-600">
              SIJIL transforms learning from any source into portable, verifiable credentials.
            </p>
            <div className="mt-8 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {sources.flat().map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#023E8A]" />
                  {item}
                </div>
              ))}
            </div>
            <Link to="/signup/learner" className="lp-btn-gradient mt-8 inline-flex">
              Start your wallet
            </Link>
          </ScrollReveal>
          <ScrollReveal delay={60}>
            <VerifiedSkillsCardMock />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

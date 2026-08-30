import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { CredentialCardMock } from "@/components/landing/LandingMocks";

export function RecruiterSection() {
  return (
    <section id="for-recruiters" className="landing-section bg-white">
      <div className="landing-container">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <ScrollReveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              See skills, not just resumes.
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-gray-600">
              Recruiters verify competencies with linked evidence — repositories, grades, tasks, and peer reviews —
              without relying on self-reported claims.
            </p>
            <Link to="/login/recruiter" className="lp-btn-gradient mt-8 inline-flex">
              See for yourself
            </Link>
          </ScrollReveal>
          <ScrollReveal delay={60}>
            <CredentialCardMock />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

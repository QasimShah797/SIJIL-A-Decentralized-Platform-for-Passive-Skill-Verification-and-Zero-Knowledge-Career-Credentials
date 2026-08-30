import { ArrowRight, Check } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { BarChartMock } from "@/components/landing/LandingMocks";

const bullets = [
  "Issue badges tied to learning outcomes",
  "Track completion and assessment data",
  "Integrate via API and webhooks",
];

export function TrustLayerSection() {
  return (
    <section id="evidence" className="landing-section bg-gray-50/80">
      <div className="landing-container">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <ScrollReveal>
            <BarChartMock />
          </ScrollReveal>
          <ScrollReveal delay={60}>
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Make learning outcomes verifiable.
            </h2>
            <p className="mt-4 leading-relaxed text-gray-600">
              Institutions map curricula to competencies and deliver credentials learners actually use in the job market.
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <Check className="h-4 w-4 shrink-0 text-[#023E8A]" />
                  {b}
                </li>
              ))}
            </ul>
            <button type="button" className="lp-btn-link mt-6">
              Learn more
              <ArrowRight className="h-4 w-4" />
            </button>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

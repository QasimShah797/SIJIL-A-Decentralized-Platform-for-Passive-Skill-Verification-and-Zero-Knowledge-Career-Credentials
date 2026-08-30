import { ScrollReveal } from "@/components/landing/ScrollReveal";

const logos = ["Coursera", "Udemy", "edX", "LinkedIn", "GitHub", "Moodle"];

export function TrustStatsBar() {
  return (
    <section className="border-y border-[#e2e8f0] bg-white py-10">
      <div className="landing-container text-center">
        <ScrollReveal>
          <p className="text-sm text-[#64748b]">Trust the world&apos;s leading brands with their professional development.</p>
          <div className="lp-logo-strip mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {logos.map((name) => (
              <span key={name} className="lp-logo-placeholder text-sm font-semibold tracking-wide text-[#94a3b8]">
                {name}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

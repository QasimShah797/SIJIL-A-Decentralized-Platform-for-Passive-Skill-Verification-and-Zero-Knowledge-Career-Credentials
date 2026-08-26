import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { landingContainer } from "@/components/landing/landing-styles";

const stats = [
  { value: "4", label: "Evidence source types connected" },
  { value: "W3C", label: "Verifiable credential format" },
  { value: "<50ms", label: "Presentation verification target" },
  { value: "100%", label: "Learner-controlled disclosure" },
] as const;

export function TrustStatsBar() {
  return (
    <section className="border-y border-border/50 bg-secondary/30 py-10 sm:py-12" aria-label="Platform trust metrics">
      <div className={landingContainer}>
        <ScrollReveal>
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-6">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center lg:text-left">
                <p className="marketing-stat-value">{value}</p>
                <p className="marketing-stat-label">{label}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

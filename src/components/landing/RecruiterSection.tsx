import { Check, Clock, Lock, ShieldOff, X } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { landingCard, landingContainer, landingSection, landingSectionAlt } from "@/components/landing/landing-styles";

const trustPoints = [
  { icon: Lock, text: "Selected fields only" },
  { icon: Clock, text: "Time-limited sharing link" },
  { icon: ShieldOff, text: "Access can be revoked" },
] as const;

const included = [
  "Competency name",
  "Domain",
  "Practical task result",
  "Context review summary",
] as const;

const excluded = [
  "Complete GitHub activity",
  "Complete LMS record",
  "Full evidence package",
] as const;

export function RecruiterSection() {
  return (
    <section id="for-recruiters" className={`${landingSection} ${landingSectionAlt}`}>
      <div className={landingContainer}>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <ScrollReveal>
            <SectionHeading
              eyebrow="For Recruiters"
              title="Verify the evidence learners choose to share."
              description="Learners control which competency details and supporting records are included in a time-limited verification link."
              align="left"
              className="mb-6 sm:mb-8"
            />
            <ul className="space-y-3">
              {trustPoints.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <span className="font-medium">{text}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <div className={`${landingCard} p-6 sm:p-7`} aria-label="Selective disclosure preview">
              <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <h3 className="text-base font-semibold">Shared Competency Summary</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Signed selective-disclosure presentation</p>
                </div>
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  Ready to share
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Included</p>
                  <ul className="space-y-2">
                    {included.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Not included</p>
                  <ul className="space-y-2">
                    {excluded.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">Link expiry</span>
                <span className="font-medium">7 days</span>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-muted-foreground/90">
                SIJIL currently supports controlled selective sharing; production-grade zero-knowledge proof
                mechanisms remain future work.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

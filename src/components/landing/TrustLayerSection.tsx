import { ArrowRight, BadgeCheck, Lock, Shield, Users } from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  landingContainer,
  landingSection,
  landingSectionAlt,
} from "@/components/landing/landing-styles";

const trustNodes = [
  { icon: Users, label: "Learners", sub: "Evidence-backed profiles" },
  { icon: Shield, label: "Verification", sub: "Automated evidence checks" },
  { icon: BadgeCheck, label: "Credentials", sub: "Wallet-ready records" },
  { icon: Lock, label: "Selective share", sub: "Consent-first disclosure" },
] as const;

export function TrustLayerSection() {
  return (
    <section className={`${landingSection} ${landingSectionAlt}`} id="trust-layer">
      <div className={landingContainer}>
        <ScrollReveal>
          <SectionHeading
            eyebrow="The trust layer"
            title="Verification-first talent identity — built on evidence, not claims."
            description="Like a connected talent marketplace, SIJIL separates self-reported skills from machine-verified evidence. Recruiters see what learners choose to disclose — with cryptographic proof when shared."
          />
        </ScrollReveal>

        <ScrollReveal delay={60}>
          <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:gap-2">
            {trustNodes.map(({ icon: Icon, label, sub }, index) => (
              <div key={label} className="flex items-center gap-2 sm:gap-3">
                <div className="trust-layer-card flex min-w-0 flex-1 items-center gap-3 sm:min-w-[200px] sm:flex-none lg:min-w-[220px]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
                {index < trustNodes.length - 1 && (
                  <ArrowRight
                    className="hidden h-4 w-4 shrink-0 text-muted-foreground/60 sm:block"
                    aria-hidden
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
            Platform = your workspace · Verification = trust · Wallet = credentials you own ·
            Marketplace = learners and recruiters connected through verified evidence.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

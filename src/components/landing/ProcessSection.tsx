import {
  ClipboardCheck,
  GraduationCap,
  Link2,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { landingCard, landingContainer, landingSection, landingSectionAlt } from "@/components/landing/landing-styles";

type Step = {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
};

const steps: Step[] = [
  {
    step: 1,
    title: "Declare a competency",
    description: "Add the skill you want to support with evidence.",
    icon: GraduationCap,
  },
  {
    step: 2,
    title: "Connect evidence",
    description: "Sync relevant GitHub activity and Moodle learning records.",
    icon: Link2,
  },
  {
    step: 3,
    title: "Complete validation",
    description: "Submit a practical task and collect context-based reviews.",
    icon: ClipboardCheck,
  },
  {
    step: 4,
    title: "Store and share",
    description: "Keep the structured record in your wallet and disclose selected fields.",
    icon: Share2,
  },
];

export function ProcessSection() {
  return (
    <section id="how-it-works" className={`${landingSection} ${landingSectionAlt}`}>
      <div className={landingContainer}>
        <ScrollReveal>
          <SectionHeading
            eyebrow="How It Works"
            title="From competency claim to shareable evidence."
            description="A focused workflow that keeps learning activity, practical validation, and reviewer context connected."
          />
        </ScrollReveal>

        <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          <div
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-10 hidden h-px bg-border/80 lg:block"
            aria-hidden="true"
          />
          {steps.map((item, index) => (
            <ScrollReveal key={item.step} delay={index * 50}>
              <li className={`${landingCard} flex h-full flex-col p-5`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {item.step}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </li>
            </ScrollReveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

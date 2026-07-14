import { BookOpen, ClipboardCheck, Github, MessageSquare } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { landingContainer } from "@/components/landing/landing-styles";

const sources = [
  { icon: Github, label: "GitHub" },
  { icon: BookOpen, label: "Moodle LMS" },
  { icon: ClipboardCheck, label: "Practical Tasks" },
  { icon: MessageSquare, label: "Contextual Reviews" },
] as const;

export function EvidenceStrip() {
  return (
    <section className="border-y border-border/40 bg-muted/30 py-5 sm:py-6" aria-label="Evidence sources">
      <div className={landingContainer}>
        <ScrollReveal>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p className="shrink-0 text-sm font-medium text-muted-foreground">Evidence connected from</p>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {sources.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm font-medium text-foreground/85">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

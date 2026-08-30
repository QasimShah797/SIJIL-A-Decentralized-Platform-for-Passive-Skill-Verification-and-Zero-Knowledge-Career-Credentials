import { Award, Link2, Share2, ShieldCheck } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const pillars = [
  { icon: Award, title: "Collect", body: "Gather skills from every learning source into one profile.", accent: false },
  { icon: Link2, title: "Connect", body: "Sync GitHub, LMS, and certificates with one click.", accent: false },
  { icon: ShieldCheck, title: "Verify", body: "Evidence-backed validation with practical tasks and reviews.", accent: false },
  { icon: Share2, title: "Share", body: "Send proof to recruiters with selective disclosure.", accent: true },
];

export function ProcessSection() {
  return (
    <section id="product" className="landing-section bg-gray-50/80">
      <div className="landing-container">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">One identity. Every proof.</h2>
            <p className="mt-3 text-gray-600">Collect, connect, verify, and share — all from a single learner-owned wallet.</p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, body, accent }, i) => (
            <ScrollReveal key={title} delay={i * 40}>
              <div className="text-center">
                <div className={`lp-pillar-icon ${accent ? "lp-pillar-icon-accent" : ""}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

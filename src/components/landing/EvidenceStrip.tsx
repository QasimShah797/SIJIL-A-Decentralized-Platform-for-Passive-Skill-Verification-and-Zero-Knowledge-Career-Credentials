import { Check } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const features = [
  {
    title: "Fragmented Portfolios",
    body: "Skills live across platforms — SIJIL unifies them into one verifiable identity.",
  },
  {
    title: "Build Your Portfolio",
    body: "Connect GitHub, Moodle, certificates, and practical tasks automatically.",
  },
  {
    title: "Verified Credentials",
    body: "Every badge is backed by evidence employers can inspect instantly.",
  },
  {
    title: "Identity & Security",
    body: "Learner-owned DIDs with zero-knowledge selective disclosure.",
  },
];

export function EvidenceStrip() {
  return (
    <section id="solutions" className="landing-section bg-white">
      <div className="landing-container">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
          <ScrollReveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Your skills are everywhere. Your proof isn&apos;t.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-gray-600">
              Learning happens across dozens of platforms, but credentials stay scattered. SIJIL brings every proof
              into one wallet you control.
            </p>
            <div className="mt-10 flex gap-14">
              <div>
                <p className="lp-stat-huge">6x</p>
                <p className="mt-1 text-sm text-gray-500">Faster verification</p>
              </div>
              <div>
                <p className="lp-stat-huge">1.5k+</p>
                <p className="mt-1 text-sm text-gray-500">Credentials issued</p>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={60}>
            <div className="rounded-2xl border border-gray-100 bg-white px-2 shadow-sm">
              {features.map((f) => (
                <div key={f.title} className="lp-check-row px-4">
                  <div className="lp-check-icon">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{f.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

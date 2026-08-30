import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { HeroHubIllustration } from "@/components/landing/LandingMocks";
import { scrollToSection } from "@/components/landing/useActiveSection";

const logos = ["Coursera", "Udemy", "edX", "LinkedIn", "GitHub", "Moodle"];

export function HeroSection() {
  return (
    <section id="home" className="lp-hero-wrap landing-section pb-8 pt-12 lg:pt-16">
      <div className="landing-container relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <ScrollReveal>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-[3.25rem]">
              Build Skills. Prove Them.{" "}
              <span className="lp-gradient-text">Verify Your Future.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-600 sm:text-lg">
              Earn shareable digital credentials backed by real evidence — so employers see proof, not promises.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup/learner" className="lp-btn-gradient">
                Get Started
              </Link>
              <button type="button" className="lp-btn-ghost" onClick={() => scrollToSection("#how-it-works")}>
                See how it works
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <HeroHubIllustration />
          </ScrollReveal>
        </div>

        <ScrollReveal delay={120}>
          <div className="mt-14 border-t border-gray-100 pt-10 text-center">
            <p className="text-sm text-gray-500">Trusted by leading institutions</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
              {logos.map((name) => (
                <span key={name} className="lp-logo-muted">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

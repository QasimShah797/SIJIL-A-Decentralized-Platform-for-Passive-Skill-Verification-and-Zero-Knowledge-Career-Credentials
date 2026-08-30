import { Fingerprint, Globe, Lock, Shield, Zap } from "lucide-react";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const cards = [
  { icon: Shield, title: "Blockchain-backed", body: "Tamper-evident records anchored to decentralized identity." },
  { icon: Lock, title: "Tamper-proof", body: "Cryptographic proofs ensure credentials cannot be altered." },
  { icon: Globe, title: "Open Standards", body: "W3C verifiable credentials compatible with global wallets." },
  { icon: Fingerprint, title: "Privacy First", body: "Zero-knowledge sharing — reveal only what you choose." },
  { icon: Zap, title: "Instant Verify", body: "Employers verify skills in seconds, not weeks." },
];

const bottomLabels = ["Data Integrity", "Privacy by design", "100% Secure", "GDPR & CCPA compliant"];

export function ProofTrustSection() {
  return (
    <section id="trust" className="lp-dark-section landing-section">
      <div className="landing-container">
        <ScrollReveal>
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Proof you can trust.</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-gray-400">
            Enterprise-grade security and open standards power every credential on SIJIL.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map(({ icon: Icon, title, body }, i) => (
            <ScrollReveal key={title} delay={i * 35}>
              <div className="lp-trust-card h-full">
                <Icon className="h-5 w-5 text-[#14b8a6]" />
                <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">{body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 border-t border-white/10 pt-10">
          {bottomLabels.map((label) => (
            <span key={label} className="text-xs font-medium text-gray-400">
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

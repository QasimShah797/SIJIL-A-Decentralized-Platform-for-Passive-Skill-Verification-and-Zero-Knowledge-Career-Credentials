import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { WalletDashboardMock } from "@/components/landing/LandingMocks";

export function EvidenceWalletSection() {
  return (
    <section id="wallet" className="landing-section bg-white">
      <div className="landing-container">
        <ScrollReveal>
          <div className="lp-showcase-panel px-5 py-12 sm:px-10 sm:py-16">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything that proves you, in one wallet.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-gray-600">
              Credentials, evidence, verification status, and share controls — unified in one dashboard.
            </p>
            <div className="mt-12">
              <WalletDashboardMock />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

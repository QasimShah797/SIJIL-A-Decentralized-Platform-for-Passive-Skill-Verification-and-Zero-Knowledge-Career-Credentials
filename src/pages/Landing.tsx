import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { EvidenceStrip } from "@/components/landing/EvidenceStrip";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { EvidenceWalletSection } from "@/components/landing/EvidenceWalletSection";
import { DualAudienceSection } from "@/components/landing/DualAudienceSection";
import { TrustLayerSection } from "@/components/landing/TrustLayerSection";
import { RecruiterSection } from "@/components/landing/RecruiterSection";
import { ProofTrustSection } from "@/components/landing/ProofTrustSection";
import { CredentialStackSection } from "@/components/landing/CredentialStackSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="landing-page min-h-screen overflow-x-hidden">
      <LandingHeader />
      <main>
        <HeroSection />
        <EvidenceStrip />
        <ProcessSection />
        <EvidenceWalletSection />
        <DualAudienceSection />
        <TrustLayerSection />
        <RecruiterSection />
        <ProofTrustSection />
        <CredentialStackSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}

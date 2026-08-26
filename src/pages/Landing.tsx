import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustStatsBar } from "@/components/landing/TrustStatsBar";
import { EvidenceStrip } from "@/components/landing/EvidenceStrip";
import { TrustLayerSection } from "@/components/landing/TrustLayerSection";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { EvidenceWalletSection } from "@/components/landing/EvidenceWalletSection";
import { DualAudienceSection } from "@/components/landing/DualAudienceSection";
import { RecruiterSection } from "@/components/landing/RecruiterSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="public-surface min-h-screen overflow-x-hidden text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <TrustStatsBar />
        <EvidenceStrip />
        <TrustLayerSection />
        <ProcessSection />
        <EvidenceWalletSection />
        <DualAudienceSection />
        <RecruiterSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}

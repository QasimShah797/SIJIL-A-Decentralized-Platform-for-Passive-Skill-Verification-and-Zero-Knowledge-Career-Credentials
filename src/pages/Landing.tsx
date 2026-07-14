import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { EvidenceStrip } from "@/components/landing/EvidenceStrip";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { EvidenceWalletSection } from "@/components/landing/EvidenceWalletSection";
import { RecruiterSection } from "@/components/landing/RecruiterSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <EvidenceStrip />
        <ProcessSection />
        <EvidenceWalletSection />
        <RecruiterSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}

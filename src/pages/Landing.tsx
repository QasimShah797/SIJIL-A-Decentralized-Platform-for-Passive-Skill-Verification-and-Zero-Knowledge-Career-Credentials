import "@/styles/about-page.css";

import { AboutNavbar } from "@/components/about/AboutNavbar";
import { AboutHero } from "@/components/about/AboutHero";
import { AboutTrust } from "@/components/about/AboutTrust";
import { AboutProblem } from "@/components/about/AboutProblem";
import { AboutHowItWorks } from "@/components/about/AboutHowItWorks";
import { AboutVerification } from "@/components/about/AboutVerification";
import { AboutProfessionalIdentity } from "@/components/about/AboutProfessionalIdentity";
import { AboutProfessionals } from "@/components/about/AboutProfessionals";
import { AboutOrganizations } from "@/components/about/AboutOrganizations";
import { AboutSocialTrust } from "@/components/about/AboutSocialTrust";
import { AboutFinalCTA } from "@/components/about/AboutFinalCTA";
import { AboutFooter } from "@/components/about/AboutFooter";

export default function Landing() {
  return (
    <div className="about-page min-h-screen overflow-x-hidden">
      <AboutNavbar />
      <main>
        <AboutHero />
        <AboutTrust />
        <AboutProblem />
        <AboutHowItWorks />
        <AboutVerification />
        <AboutProfessionalIdentity />
        <AboutProfessionals />
        <AboutOrganizations />
        <AboutSocialTrust />
        <AboutFinalCTA />
      </main>
      <AboutFooter />
    </div>
  );
}

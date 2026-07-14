import { Link } from "react-router-dom";
import { Logo } from "@/components/landing/Logo";
import { landingContainer } from "@/components/landing/landing-styles";
import { scrollToSection } from "@/components/landing/useActiveSection";

type FooterLink = { label: string; href?: string; section?: string };

const productLinks: FooterLink[] = [
  { label: "How It Works", section: "#how-it-works" },
  { label: "Evidence", section: "#evidence" },
  { label: "Wallet", section: "#wallet" },
];

const accessLinks: FooterLink[] = [
  { label: "Get Started", href: "/" },
  { label: "Sign In", href: "/" },
];

const projectLinks: FooterLink[] = [
  { label: "For Recruiters", section: "#for-recruiters" },
  { label: "About SIJIL", section: "#home" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.href ? (
              <Link
                to={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                {link.label}
              </Link>
            ) : link.section ? (
              <button
                type="button"
                onClick={() => scrollToSection(link.section!)}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                {link.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className={`${landingContainer} py-10 sm:py-12`}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={() => scrollToSection("#home")}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="SIJIL home"
            >
              <Logo />
            </button>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Evidence-backed competency records for modern learners.
            </p>
          </div>
          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Access" links={accessLinks} />
          <FooterColumn title="Project" links={projectLinks} />
        </div>
      </div>
      <div className="border-t border-border/40 py-4 text-center text-sm text-muted-foreground">
        SIJIL — Decentralized competency records
      </div>
    </footer>
  );
}

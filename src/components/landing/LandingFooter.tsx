import { Link } from "react-router-dom";
import { Logo } from "@/components/landing/Logo";
import { scrollToSection } from "@/components/landing/useActiveSection";

const columns = [
  {
    title: "Platform",
    links: [
      { label: "Wallet", section: "#wallet" },
      { label: "Integrations", section: "#evidence" },
      { label: "Verification", section: "#trust" },
      { label: "Pricing", section: "#cta" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", section: "#home" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Help Center", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
      { label: "Cookies", href: "#" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="landing-container py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <button type="button" onClick={() => scrollToSection("#home")} aria-label="SIJIL home">
              <Logo />
            </button>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              Decentralized professional skill verification for the modern workforce.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-bold text-gray-900">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"section" in link && link.section ? (
                      <button
                        type="button"
                        onClick={() => scrollToSection(link.section!)}
                        className="text-sm text-gray-500 hover:text-gray-900"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">{link.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100 py-5">
        <div className="landing-container flex flex-col items-center justify-between gap-4 text-sm text-gray-500 sm:flex-row">
          <p>© {new Date().getFullYear()} SIJIL. All rights reserved.</p>
          <div className="flex gap-5">
            {["Twitter", "LinkedIn", "GitHub"].map((s) => (
              <Link key={s} to="/login/learner" className="hover:text-gray-900">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

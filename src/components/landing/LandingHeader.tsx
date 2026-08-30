import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { scrollToSection } from "@/components/landing/useActiveSection";

const navLinks = [
  { label: "Platform", href: "#product" },
  { label: "Solutions", href: "#solutions" },
  { label: "Resources", href: "#stack" },
  { label: "Pricing", href: "#cta" },
  { label: "About", href: "#home" },
] as const;

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleNav = (href: string) => scrollToSection(href, () => setMobileOpen(false));

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="landing-container flex h-16 items-center justify-between gap-4">
        <button type="button" onClick={() => handleNav("#home")} aria-label="SIJIL home">
          <Logo />
        </button>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {navLinks.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => handleNav(item.href)}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link to="/login/learner" className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Log in
          </Link>
          <Link to="/signup/learner" className="lp-btn-gradient">
            Get Started
          </Link>
        </div>

        <button type="button" className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-gray-100 px-5 py-4 lg:hidden">
          {navLinks.map((item) => (
            <button key={item.href} type="button" onClick={() => handleNav(item.href)} className="block w-full py-2.5 text-left text-sm font-medium text-gray-700">
              {item.label}
            </button>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
            <Link to="/login/learner" className="lp-btn-ghost justify-center" onClick={() => setMobileOpen(false)}>Log in</Link>
            <Link to="/signup/learner" className="lp-btn-gradient justify-center" onClick={() => setMobileOpen(false)}>Get Started</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

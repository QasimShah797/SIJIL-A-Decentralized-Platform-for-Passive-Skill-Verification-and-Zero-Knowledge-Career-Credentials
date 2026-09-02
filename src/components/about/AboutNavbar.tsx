import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";
import { scrollToAboutSection } from "@/components/about/about-scroll";

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Evidence Trail", href: "#evidence-trail" },
  { label: "For Professionals", href: "#for-professionals" },
  { label: "For Organizations", href: "#for-organizations" },
  { label: "About", href: "#about" },
] as const;

export function AboutNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNav = (href: string) => {
    scrollToAboutSection(href, () => setMobileOpen(false));
  };

  return (
    <header className={`about-navbar ${scrolled ? "about-navbar-scrolled" : ""}`}>
      <div className="about-container about-navbar-inner">
        <a href="#hero" className="about-brand about-focus-ring" onClick={(e) => { e.preventDefault(); handleNav("#hero"); }}>
          <span className="about-brand-logo">
            <img src={sijilLogo} alt="" />
          </span>
          <span className="about-brand-text">
            <span className="about-brand-name">SIJIL</span>
            <span className="about-brand-tagline">Build. Prove. Aggregate.</span>
          </span>
        </a>

        <nav className="about-nav-links" aria-label="Main">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="about-nav-link about-focus-ring"
              onClick={(e) => {
                e.preventDefault();
                handleNav(href);
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="about-nav-actions">
          <Link to="/login/learner" className="about-nav-signin about-focus-ring">
            Sign In
          </Link>
          <Link to="/signup/learner" className="about-btn-primary about-nav-getstarted about-focus-ring">
            Get Started
          </Link>
        </div>

        <button
          type="button"
          className="about-menu-btn about-focus-ring"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="about-mobile-menu lg:hidden">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="about-mobile-menu-link"
              onClick={(e) => {
                e.preventDefault();
                handleNav(href);
              }}
            >
              {label}
            </a>
          ))}
          <div className="about-mobile-menu-actions">
            <Link to="/login/learner" className="about-btn-secondary w-full text-center" onClick={() => setMobileOpen(false)}>
              Sign In
            </Link>
            <Link to="/signup/learner" className="about-btn-primary w-full text-center" onClick={() => setMobileOpen(false)}>
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

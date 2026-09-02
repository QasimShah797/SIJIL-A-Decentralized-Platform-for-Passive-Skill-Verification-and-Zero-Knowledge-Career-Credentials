import { Link } from "react-router-dom";
import sijilLogo from "@/assets/sijil-logo.png";
import { scrollToAboutSection } from "@/components/about/about-scroll";

const FOOTER_LINKS = {
  Product: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Evidence Trail", href: "#evidence-trail" },
    { label: "Credentials", href: "#evidence-trail" },
    { label: "Evidence", href: "#how-it-works" },
  ],
  Company: [
    { label: "About", href: "#about" },
    { label: "Contact", href: "#about" },
  ],
  Resources: [
    { label: "Documentation", href: "#about" },
    { label: "FAQ", href: "#about" },
  ],
  Legal: [
    { label: "Privacy", href: "#about" },
    { label: "Terms", href: "#about" },
  ],
} as const;

export function AboutFooter() {
  const handleAnchor = (href: string) => (e: React.MouseEvent) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      scrollToAboutSection(href);
    }
  };

  return (
    <footer id="about" className="about-footer">
      <div className="about-container">
        <div className="about-footer-grid">
          <div>
            <a href="#hero" className="about-brand" onClick={handleAnchor("#hero")}>
              <span className="about-brand-logo">
                <img src={sijilLogo} alt="" />
              </span>
              <span className="about-brand-name">SIJIL</span>
            </a>
            <p className="about-footer-brand-desc">Build. Prove. Aggregate.</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#64748B]">
              Professional skill evidence aggregation and digital credential platform. Turn real work
              into assembled proof.
            </p>
          </div>

          {(Object.entries(FOOTER_LINKS) as [keyof typeof FOOTER_LINKS, typeof FOOTER_LINKS[keyof typeof FOOTER_LINKS]][]).map(
            ([title, links]) => (
              <div key={title}>
                <p className="about-footer-col-title">{title}</p>
                <nav className="about-footer-links" aria-label={title}>
                  {links.map(({ label, href }) => (
                    <a
                      key={label}
                      href={href}
                      className="about-footer-link"
                      onClick={handleAnchor(href)}
                    >
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
            ),
          )}
        </div>

        <div className="about-footer-bottom">
          <p>© {new Date().getFullYear()} SIJIL. All rights reserved.</p>
          <div className="about-footer-legal">
            <Link to="/login/learner" className="about-footer-link">
              Sign In
            </Link>
            <Link to="/signup/learner" className="about-footer-link">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

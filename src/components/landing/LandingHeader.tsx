import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/landing/Logo";
import { landingContainer, landingNavLink } from "@/components/landing/landing-styles";
import { scrollToSection, useActiveSection } from "@/components/landing/useActiveSection";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Evidence", href: "#evidence" },
  { label: "Wallet", href: "#wallet" },
  { label: "For Recruiters", href: "#for-recruiters" },
] as const;

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeId = useActiveSection();

  const handleNavClick = (href: string) => {
    scrollToSection(href, () => setMobileOpen(false));
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className={cn(landingContainer, "flex h-[4.25rem] items-center justify-between gap-4")}>
        <button
          type="button"
          onClick={() => handleNavClick("#home")}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="SIJIL home"
        >
          <Logo />
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {navLinks.map((item) => {
            const id = item.href.replace("#", "");
            const isActive = activeId === id;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavClick(item.href)}
                className={cn(landingNavLink(isActive), isActive && "underline decoration-primary/40 underline-offset-8")}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          <Link to="/">
            <Button variant="ghost" size="sm" className="rounded-xl text-sm font-medium">
              Sign In
            </Button>
          </Link>
          <Link to="/">
            <Button size="sm" className="rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90">
              Get Started
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-0.5" aria-label="Mobile navigation">
            {navLinks.map((item) => {
              const id = item.href.replace("#", "");
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activeId === id ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-4">
            <Link to="/" onClick={() => setMobileOpen(false)}>
              <Button variant="outline" className="w-full rounded-xl">
                Sign In
              </Button>
            </Link>
            <Link to="/" onClick={() => setMobileOpen(false)}>
              <Button className="w-full rounded-xl bg-primary hover:bg-primary/90">Get Started</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Fingerprint,
  FolderGit2,
  Github,
  GraduationCap,
  Layers,
  Link2,
  Lock,
  Menu,
  MessageSquare,
  Plug,
  Route,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import { Button } from "@/components/ui/button";
import sijilLogo from "@/assets/sijil-logo.png";

const navLinks = [
  { label: "Home", href: "#home" },
  { label: "Learner", href: "#learners" },
  { label: "Verification", href: "#verification" },
  { label: "Features", href: "#features" },
  { label: "Roadmap", href: "#roadmap" },
];

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`}>
      <img src={sijilLogo} alt="SIJIL" className="h-9 w-9 object-contain" />
      <span className="text-lg font-semibold tracking-tight text-foreground">SIJIL</span>
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      {eyebrow && (
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">{eyebrow}</p>
      )}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sijil-card group h-full">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const id = href.replace("#", "");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="sijil-container flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => scrollTo(item.href)}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle />
            <Link to="/login/learner">
              <Button variant="ghost" size="sm" className="rounded-full">
                Learner Sign In
              </Button>
            </Link>
            <Link to="/signup/learner">
              <Button size="sm" className="rounded-full">
                Learner Sign Up
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-border/60 bg-background px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-1">
              {navLinks.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => scrollTo(item.href)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
              <Link to="/signup/learner" onClick={() => setMobileOpen(false)}>
                <Button className="w-full rounded-full">Learner Sign Up</Button>
              </Link>
              <Link to="/login/learner" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full rounded-full">Learner Sign In</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <section id="home" className="sijil-section scroll-mt-16">
        <div className="sijil-container">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Decentralized competency records for learners
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Own your skills.{" "}
              <span className="text-primary">Prove them with evidence.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              SIJIL helps learners build competency portfolios by combining GitHub evidence, Moodle
              records, practical assessment, and reviews into learner-owned wallet records.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup/learner">
                <Button size="lg" className="rounded-full px-8">
                  Learner Sign Up
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login/learner">
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  Learner Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="verification" className="sijil-section sijil-section-alt scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Flow"
            title="Final learner flow"
            description="The learner journey is competency-centered from profile setup to wallet storage."
          />
          <div className="mx-auto max-w-3xl space-y-4">
            {[
              { tier: 1, title: "Learner Sign Up", text: "Create a learner account and start your SIJIL workspace." },
              { tier: 2, title: "Complete Profile", text: "Finish your profile and establish your learner DID." },
              { tier: 3, title: "Declare Competency", text: "Define the competency you want to support with evidence." },
              { tier: 4, title: "Connect GitHub / Moodle", text: "Sync source evidence that maps to the competency." },
              { tier: 5, title: "Collect evidence and perform task", text: "Submit a practical task attempt and continue building the evidence package." },
              { tier: 6, title: "Collect reviews", text: "Add peer and teacher context when available." },
              { tier: 7, title: "Store wallet record", text: "Keep one wallet record per competency with evidence, task history, and review context." },
            ].map((item) => (
              <div key={item.tier} className="flex gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.tier}
                </div>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="sijil-section scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Process"
            title="How SIJIL works"
            description="A transparent path from declaration to evidence package and wallet record."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: GraduationCap, step: "01", title: "Complete your profile", text: "Set up your learner identity and finish onboarding before declaring competencies." },
              { icon: Link2, step: "02", title: "Declare competency", text: "Claim the competency you want to support with evidence and practical task history." },
              { icon: Plug, step: "03", title: "Connect evidence", text: "Link GitHub, Moodle, projects, and supporting records to the declared competency." },
              { icon: Share2, step: "04", title: "Store wallet record", text: "Submit the task, collect reviews, and keep one evidence package per competency in your wallet." },
            ].map((item) => (
              <div key={item.step} className="sijil-card relative">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.step}</span>
                <div className="mb-3 mt-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="evidence-sources" className="sijil-section sijil-section-alt scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Evidence"
            title="Evidence sources"
            description="SIJIL aggregates trust signals from real work and learning activity, not self-reported claims alone."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Github} title="GitHub activity">
              Repository work, commits, pull requests, and linked review context become competency evidence.
            </FeatureCard>
            <FeatureCard icon={BookOpen} title="LMS / Moodle">
              Course records, assignments, grades, and teacher feedback can be grouped under the same competency.
            </FeatureCard>
            <FeatureCard icon={FolderGit2} title="Project work">
              Manual project evidence and supporting records add context around real-world practice.
            </FeatureCard>
            <FeatureCard icon={FileText} title="Evidence packages">
              Every competency record keeps its source material, timestamps, and latest practical task result together.
            </FeatureCard>
          </div>
        </div>
      </section>

      <section id="wallet" className="sijil-section scroll-mt-16">
        <div className="sijil-container">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Identity</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Competency wallet</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Every learner receives a decentralized identifier and a wallet that groups evidence by
                competency. Store task attempts, reviews, and supporting evidence without giving up
                control of your career data.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Holder DID bound to your SIJIL identity",
                  "One wallet record per competency",
                  "Evidence packages grouped by source and status",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="credential-card sijil-card rounded-3xl p-8 text-primary-foreground">
              <Fingerprint className="h-10 w-10 opacity-90" />
              <p className="mt-6 text-sm uppercase tracking-wider opacity-80">Learner wallet</p>
              <p className="mt-2 text-2xl font-semibold">Your competencies. Your evidence.</p>
              <p className="mt-4 text-sm leading-relaxed opacity-85">
                SIJIL wallets are portable, evidence-backed, and designed around learner ownership.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="learners" className="sijil-section sijil-section-alt scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Community"
            title="For learners"
            description="Create your identity, complete your profile, and build a competency portfolio recruiters can understand."
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <FeatureCard icon={GraduationCap} title="Learner-owned account">
              Sign up directly, complete your professional profile, and control what you share.
            </FeatureCard>
            <FeatureCard icon={Layers} title="Competency portfolio">
              Declare skills, link evidence, and track validation progress in one workspace.
            </FeatureCard>
            <FeatureCard icon={Award} title="Competency wallet">
              Keep one wallet record per competency with evidence, practical task results, and reviews.
            </FeatureCard>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/signup/learner">
              <Button className="rounded-full">Create your SIJIL identity</Button>
            </Link>
            <Link to="/login/learner">
              <Button variant="outline" className="rounded-full">Learner Sign In</Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="recruiters" className="sijil-section scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Hiring"
            title="For recruiters"
            description="Evaluate candidates through evidence packages and competency records instead of keyword-matched resumes."
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <FeatureCard icon={Search} title="Evidence-first search">
              Discover candidates with linked GitHub, LMS, project work, and task outcomes.
            </FeatureCard>
            <FeatureCard icon={Users} title="Reviewer context">
              See who validated the competency and under what working relationship.
            </FeatureCard>
            <FeatureCard icon={Wallet} title="Competency records">
              Inspect source badges, practical task results, review context, and supporting evidence in one package.
            </FeatureCard>
          </div>
        </div>
      </section>

      <section id="features" className="sijil-section sijil-section-alt scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="Platform"
            title="Platform features"
            description="Everything needed for decentralized skill verification in one cohesive learner workspace."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Sparkles, title: "AI practical tasks", text: "Evidence-informed MCQ generation and secure server-side scoring." },
              { icon: MessageSquare, title: "Peer reviews", text: "Context-based reviews from verified project contributors." },
              { icon: ShieldCheck, title: "Evidence packages", text: "Full audit path from source evidence to competency wallet records." },
              { icon: Plug, title: "Integrations", text: "GitHub and Moodle connections with sync and evidence mapping." },
              { icon: Fingerprint, title: "Decentralized identity", text: "DID-backed wallet for learner-owned competency records." },
              { icon: Lock, title: "Privacy by design", text: "Selective disclosure keeps the learner in control of shared evidence." },
            ].map((feature) => (
              <FeatureCard key={feature.title} icon={feature.icon} title={feature.title}>
                {feature.text}
              </FeatureCard>
            ))}
          </div>
        </div>
      </section>

      <section id="roadmap" className="sijil-section scroll-mt-16">
        <div className="sijil-container">
          <SectionHeading
            eyebrow="What's next"
            title="Roadmap"
            description="SIJIL is evolving toward richer evidence aggregation, stronger recruiter tooling, and broader ecosystem support."
          />
          <div className="mx-auto max-w-2xl space-y-4">
            {[
              { phase: "Now", title: "Learner identity & competency core", status: "Live", items: ["Self-signup & profile completion", "GitHub & Moodle integrations", "MCQ practical tasks & peer review", "Competency wallet records"] },
              { phase: "Next", title: "Recruiter & disclosure tooling", status: "In progress", items: ["Recruiter search & compare", "Enhanced selective disclosure", "Evidence package views"] },
              { phase: "Future", title: "Ecosystem expansion", status: "Planned", items: ["Additional evidence providers", "Cross-platform competency analytics", "Trusted verification rules for later credential issuance"] },
            ].map((phase) => (
              <div key={phase.phase} className="sijil-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Route className="h-5 w-5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">{phase.phase}</span>
                    <h3 className="font-semibold">{phase.title}</h3>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{phase.status}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sijil-section">
        <div className="sijil-container">
          <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-success/5 p-10 text-center shadow-sm sm:p-14">
            <h2 className="text-2xl font-semibold sm:text-3xl">Start building your verified portfolio</h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Join SIJIL as a learner and start building competency-centered wallet records today.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup/learner">
                <Button size="lg" className="rounded-full px-8">Learner Sign Up</Button>
              </Link>
              <Link to="/login/learner">
                <Button size="lg" variant="outline" className="rounded-full px-8">Learner Sign In</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-background">
        <div className="sijil-container flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
          <div className="text-center sm:text-left">
            <Logo />
            <p className="mt-2 text-sm text-muted-foreground">Evidence-backed competencies.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link to="/signup/learner" className="font-medium text-primary hover:underline">Sign Up</Link>
            <Link to="/login/learner" className="text-muted-foreground hover:text-foreground">Learner Sign In</Link>
          </div>
        </div>
        <div className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SIJIL. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

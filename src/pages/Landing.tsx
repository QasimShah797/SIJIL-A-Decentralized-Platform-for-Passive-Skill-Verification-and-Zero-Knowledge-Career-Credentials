import { Link } from "react-router-dom";
import {
  ShieldCheck,
  GraduationCap,
  Building2,
  Search,
  FileCheck,
  Users,
  Award,
  Wallet,
  Link2,
  CheckCircle2,
  Share2,
  Lock,
} from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";

const Logo = ({ size = "sm" }: { size?: "sm" | "lg" }) => (
  <Link to="/" className="flex items-center gap-2">
    <img
      src={sijilLogo}
      alt="SIJIL logo"
      className={size === "lg" ? "h-12 w-12 object-contain" : "h-9 w-9 object-contain"}
    />
    <span className="text-lg font-semibold tracking-tight">SIJIL</span>
  </Link>
);

const features = [
  {
    icon: FileCheck,
    title: "Evidence Collection",
    text: "Connect projects, LMS records, GitHub activity, and supporting documents as skill evidence.",
  },
  {
    icon: Users,
    title: "Context-Based Peer Review",
    text: "Only verified project contributors and connected reviewers can provide trust-based reviews.",
  },
  {
    icon: Award,
    title: "Institutional Attestation",
    text: "Institutions can review learner evidence and issue trusted attestations.",
  },
  {
    icon: Wallet,
    title: "Digital Credentials",
    text: "Learners can store and share verifiable credentials through their SIJIL wallet.",
  },
];

const steps = [
  { icon: Link2, title: "Link Evidence", text: "Learner connects GitHub, LMS, Spark, or manual project evidence." },
  { icon: ShieldCheck, title: "Verify Context", text: "SIJIL checks project contributors, reviewer relationships, and source context." },
  { icon: CheckCircle2, title: "Collect Trust Signals", text: "Reviews, feedback, attestations, and evidence records are aggregated." },
  { icon: Share2, title: "Share Credentials", text: "Learner shares verified credentials and selected evidence with recruiters." },
];

const roles = [
  { icon: GraduationCap, title: "Learner", text: "Create your SIJIL identity, collect evidence, and build a verified competency portfolio." },
  { icon: Building2, title: "Institution", text: "Review learner evidence and issue attestations or credentials." },
  { icon: Search, title: "Recruiter", text: "View trusted evidence, reviewer context, and verifiable credentials before hiring." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-info/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative">
        {/* Navbar */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Logo />
            <div className="flex items-center gap-4">
              <Link
                to="/signup/learner"
                className="text-sm font-medium text-primary hover:underline"
              >
                Learner Sign Up
              </Link>
              <Link
                to="/login/learner"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Learner Sign In
              </Link>
              <Link
                to="/login/institution"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Institution Sign In
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              SSI-based trust aggregation platform
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Build trusted competency records from{" "}
              <span className="bg-gradient-to-r from-primary via-info to-primary-glow bg-clip-text text-transparent">
                real evidence.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              SIJIL helps learners collect project evidence, verify contributor reviews,
              receive institutional attestations, and share trusted digital credentials with
              recruiters.
            </p>
            <p className="mt-8 flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-center">
              <Link
                to="/signup/learner"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90"
              >
                Learner Sign Up
              </Link>
              <Link
                to="/login/learner"
                className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 font-medium hover:bg-muted/60"
              >
                Learner Sign In
              </Link>
              <Link
                to="/login/institution"
                className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 font-medium hover:bg-muted/60"
              >
                Institution Sign In
              </Link>
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">What SIJIL does</h2>
            <p className="mt-3 text-muted-foreground">
              A complete trust layer for skills, evidence, and credentials.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(222_47%_11%/0.04),0_8px_24px_-12px_hsl(222_47%_11%/0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_2px_4px_hsl(222_47%_11%/0.06),0_16px_40px_-16px_hsl(222_47%_11%/0.18)]"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How SIJIL works</h2>
            <p className="mt-3 text-muted-foreground">
              From raw evidence to verifiable credentials in four steps.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(222_47%_11%/0.04),0_8px_24px_-12px_hsl(222_47%_11%/0.08)] transition-all hover:-translate-y-1"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-info/10 text-info">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who uses */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Who uses SIJIL</h2>
            <p className="mt-3 text-muted-foreground">
              Built for learners, institutions, and recruiters.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => (
              <div
                key={r.title}
                className="group rounded-2xl border border-border/70 bg-card p-7 shadow-[0_1px_2px_hsl(222_47%_11%/0.04),0_8px_24px_-12px_hsl(222_47%_11%/0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_2px_4px_hsl(222_47%_11%/0.06),0_16px_40px_-16px_hsl(222_47%_11%/0.18)]"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md transition-transform group-hover:scale-110">
                  <r.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                {r.title === "Learner" && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      to="/signup/learner"
                      className="inline-flex text-sm font-medium text-primary hover:underline"
                    >
                      Learner Sign Up →
                    </Link>
                    <Link
                      to="/login/learner"
                      className="inline-flex text-sm font-medium text-muted-foreground hover:underline"
                    >
                      Sign In →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl border border-border/70 bg-gradient-to-br from-card to-secondary/40 p-8 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] sm:p-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success">
                <Lock className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Trust and privacy by design
                </h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  SIJIL is designed around SSI, decentralized identity, selective disclosure,
                  and evidence-based verification. The platform does not automatically label
                  users as beginner, intermediate, or expert. Instead, it helps recruiters and
                  institutions interpret verified evidence and trust signals.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/60 bg-background/60 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
            <div className="flex flex-col items-center gap-1 sm:items-start">
              <Logo />
              <p className="text-xs text-muted-foreground">
                Verified Skills. Trusted Credentials.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/signup/learner"
                className="text-sm font-medium text-primary hover:underline"
              >
                Learner Sign Up
              </Link>
              <Link
                to="/login/learner"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Learner Sign In
              </Link>
              <Link
                to="/login/institution"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Institution Sign In
              </Link>
            </div>
          </div>
          <div className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} SIJIL. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}

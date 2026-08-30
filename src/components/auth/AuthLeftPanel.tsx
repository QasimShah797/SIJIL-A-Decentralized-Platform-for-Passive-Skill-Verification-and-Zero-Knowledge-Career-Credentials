import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Fingerprint,
  GraduationCap,
  Share2,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import sijilLogo from "@/assets/sijil-logo.png";

const CREDENTIAL_TILES = [
  { icon: GraduationCap, label: "Evidence" },
  { icon: ShieldCheck, label: "Verification" },
  { icon: Share2, label: "Selective share" },
] as const;

const PROGRESS_BARS = [
  { label: "Evidence linked", width: 88, fillClass: "auth-bar-teal" },
  { label: "Validation complete", width: 72, fillClass: "auth-bar-blue" },
  { label: "Verification passed", width: 94, fillClass: "auth-bar-cyan" },
] as const;

export function AuthLeftPanel() {
  return (
    <div className="auth-page-left text-white">
      <div aria-hidden className="auth-page-left-glow pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-glow-top absolute -right-10 -top-10 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="auth-glow-bottom absolute -bottom-16 right-0 h-72 w-72 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="auth-glow-mid absolute bottom-1/4 left-1/4 h-40 w-40 rounded-full bg-cyan-400/10 blur-2xl" />
      </div>

      <div className="auth-left-inner relative z-10">
        <header className="auth-left-header flex shrink-0 items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-lg">
              <img src={sijilLogo} alt="" className="h-full w-full object-contain" />
            </span>
            <span className="text-lg font-bold tracking-tight">SIJIL</span>
          </Link>
          <ThemeToggle className="h-9 w-9 rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20" />
        </header>

        <div className="auth-left-hero">
          <p className="auth-left-eyebrow">Verification-first platform</p>
          <h1 className="auth-left-headline">
            Trusted evidence.
            <br />
            Credentials you control.
          </h1>
          <p className="auth-left-body">
            Connect GitHub, LMS, practical tasks, and peer reviews into verifiable competency
            records — then share only what recruiters need to see.
          </p>

          <div className="auth-left-actions">
            <Link to="/about" className="auth-learn-btn">
              Learn more
            </Link>
            <span className="auth-security-pill">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Enterprise-grade security
            </span>
          </div>
        </div>

        <div className="auth-left-spacer" aria-hidden />

        <div className="auth-left-credential">
          <div className="auth-credential-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="auth-credential-icon-wrap">
                  <Fingerprint className="h-5 w-5 text-white/95" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">Verifiable credential</p>
                  <p className="mt-0.5 text-xs text-white/65">Learner-owned wallet</p>
                </div>
              </div>
              <span className="auth-credential-check">
                <BadgeCheck className="h-5 w-5" strokeWidth={2.25} />
              </span>
            </div>

            <div className="auth-credential-icons">
              {CREDENTIAL_TILES.map(({ icon: Icon, label }) => (
                <div key={label} className="auth-credential-icon-tile">
                  <Icon className="h-5 w-5 text-white/90" strokeWidth={1.75} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="auth-credential-bars">
              {PROGRESS_BARS.map(({ label, width, fillClass }) => (
                <div key={label}>
                  <div className="auth-credential-bar-label">
                    <span>{label}</span>
                    <span className="tabular-nums">{width}%</span>
                  </div>
                  <div className="auth-credential-bar-track">
                    <div
                      className={`auth-credential-bar-fill ${fillClass}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

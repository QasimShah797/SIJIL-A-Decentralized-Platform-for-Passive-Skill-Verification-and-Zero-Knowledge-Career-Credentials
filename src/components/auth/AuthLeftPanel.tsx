import { Link } from "react-router-dom";
import { BadgeCheck, Fingerprint, GraduationCap, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import sijilLogo from "@/assets/sijil-logo.png";

export function AuthLeftPanel() {
  return (
    <div className="auth-panel-gradient relative flex min-h-[280px] flex-col justify-between overflow-hidden px-8 py-10 text-primary-foreground lg:min-h-screen lg:px-12 lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-success/25 blur-3xl" />
        <div className="absolute right-1/4 top-1/3 h-40 w-40 rounded-full bg-info/20 blur-2xl" />
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-lg">
          <img src={sijilLogo} alt="" className="h-11 w-11 rounded-xl bg-white/95 p-1.5 object-contain shadow-md" />
          <span className="text-lg font-semibold tracking-tight">SIJIL</span>
        </Link>
        <ThemeToggle className="border-white/20 bg-white/10 text-primary-foreground hover:bg-white/20" />
      </div>

      <div className="relative z-10 my-8 max-w-lg">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
          Verification-first platform
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          Trusted evidence. Credentials you control.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
          Connect GitHub, LMS, practical tasks, and peer reviews into verifiable competency records —
          then share only what recruiters need to see.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            asChild
            variant="secondary"
            className="rounded-xl bg-white/95 text-primary shadow-md hover:bg-white"
          >
            <Link to="/about">Learn more</Link>
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            Enterprise-grade security
          </span>
        </div>
      </div>

      <div className="relative z-10 hidden lg:block">
        <div className="relative mx-auto max-w-md">
          <div className="absolute inset-0 rounded-3xl bg-white/5 blur-xl" />
          <div className="relative rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Fingerprint className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium">Verifiable credential</p>
                  <p className="text-xs text-primary-foreground/70">Learner-owned wallet</p>
                </div>
              </div>
              <BadgeCheck className="h-8 w-8 text-success" />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: GraduationCap, label: "Evidence" },
                { icon: Shield, label: "Verification" },
                { icon: Sparkles, label: "Selective share" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center"
                >
                  <Icon className="h-5 w-5 text-primary-foreground/90" />
                  <span className="text-[11px] font-medium text-primary-foreground/80">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              {[
                { label: "Evidence linked", width: 88 },
                { label: "Validation complete", width: 72 },
                { label: "Verification passed", width: 94 },
              ].map(({ label, width }) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-[10px] text-primary-foreground/60">
                    <span>{label}</span>
                    <span className="tabular-nums">{width}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-success to-info transition-all duration-700"
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

import { Link } from "react-router-dom";
import { BadgeCheck, Fingerprint, GraduationCap, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import sijilLogo from "@/assets/sijil-logo.png";

export function AuthLeftPanel() {
  return (
    <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-[hsl(217_91%_28%)] px-8 py-10 text-primary-foreground lg:min-h-screen lg:px-12 lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-[hsl(152_65%_36%/0.25)] blur-3xl" />
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
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          Welcome to SIJIL
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
          Decentralized competency verification powered by GitHub activity, LMS transcripts, peer
          reviews, and practical tasks — building learner-owned credentials you can trust and share.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Button
            asChild
            variant="secondary"
            className="rounded-xl bg-white/95 text-primary shadow-md hover:bg-white"
          >
            <Link to="/about">Learn more</Link>
          </Button>
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
                  <p className="text-sm font-medium">Digital identity</p>
                  <p className="text-xs text-primary-foreground/70">Learner-owned credentials</p>
                </div>
              </div>
              <BadgeCheck className="h-8 w-8 text-[hsl(152_65%_56%)]" />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: GraduationCap, label: "LMS" },
                { icon: Shield, label: "Peer review" },
                { icon: Sparkles, label: "ZK proofs" },
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
              {[88, 72, 94].map((width, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[hsl(152_65%_56%)] to-info transition-all duration-700"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-primary-foreground/60">{width}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

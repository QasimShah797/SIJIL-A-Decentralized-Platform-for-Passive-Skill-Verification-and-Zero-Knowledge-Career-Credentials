import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Eye,
  Lock,
  Search,
  Share2,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import sijilLogo from "@/assets/sijil-logo.png";

const features = [
  { icon: Search, label: "Evidence-first search" },
  { icon: Share2, label: "Selective disclosure" },
  { icon: Users, label: "Competency records" },
  { icon: Eye, label: "Verified presentations" },
] as const;

export function RecruiterLeftPanel() {
  return (
    <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[hsl(222_47%_14%)] via-primary to-[hsl(217_91%_28%)] px-8 py-10 text-primary-foreground lg:min-h-screen lg:px-12 lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-info/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <Link
          to="/about"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          <img
            src={sijilLogo}
            alt=""
            className="h-11 w-11 rounded-xl bg-white/95 p-1.5 object-contain shadow-md"
            aria-hidden="true"
          />
          <span className="text-lg font-semibold tracking-tight">SIJIL</span>
        </Link>
        <ThemeToggle className="border-white/20 bg-white/10 text-primary-foreground hover:bg-white/20" />
      </div>

      <div className="relative z-10 my-8 max-w-lg">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Recruiter portal — invitation only
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          Review competency records with confidence
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
          Access learner-shared evidence packages, practical task results, and selective disclosure
          presentations — all under learner control.
        </p>
      </div>

      <div className="relative z-10 hidden lg:block">
        <div className="relative mx-auto max-w-md">
          <div className="absolute inset-0 rounded-3xl bg-white/5 blur-xl" aria-hidden="true" />
          <div className="relative rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Shared competency record</p>
                <p className="text-xs text-primary-foreground/70">TypeScript · Software Development</p>
              </div>
              <BadgeCheck className="h-8 w-8 text-[hsl(152_65%_56%)]" aria-hidden="true" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {features.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary-foreground/90" aria-hidden="true" />
                  <span className="text-[11px] font-medium leading-tight text-primary-foreground/85">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
              {[
                { label: "Practical task score", value: "Disclosed" },
                { label: "GitHub evidence", value: "Disclosed" },
                { label: "LMS records", value: "Hidden" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-primary-foreground/70">{row.label}</span>
                  <span
                    className={
                      row.value === "Disclosed"
                        ? "font-medium text-[hsl(152_65%_56%)]"
                        : "text-primary-foreground/50"
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

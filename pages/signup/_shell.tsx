import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";

export function SignupShell({
  title, subtitle, children, backTo = "/signup", maxWidth = "max-w-xl",
}: { title: string; subtitle?: string; children: React.ReactNode; backTo?: string; maxWidth?: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-info/10 blur-3xl" />
      </div>
      <div className={`relative mx-auto ${maxWidth}`}>
        <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={sijilLogo} alt="SIJIL" className="h-12 w-12 object-contain" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] backdrop-blur sm:p-8">
          {children}
        </div>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          SIJIL protects learner evidence and credentials through trust-based verification and selective disclosure.
        </div>
      </div>
    </div>
  );
}

export function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

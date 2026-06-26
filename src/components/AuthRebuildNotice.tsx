import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";

export function AuthRebuildNotice() {
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background via-background to-secondary/40 px-4">
      <div className="max-w-md w-full rounded-2xl border border-border/70 bg-card/95 p-8 text-center shadow-lg">
        <Link to="/" className="inline-flex flex-col items-center mb-6">
          <img src={sijilLogo} alt="SIJIL" className="h-14 w-14 object-contain" />
          <span className="mt-2 text-lg font-semibold tracking-tight">SIJIL</span>
        </Link>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Authentication module is being rebuilt.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign-in, registration, and role access are temporarily unavailable while we implement the new professional auth flow.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}

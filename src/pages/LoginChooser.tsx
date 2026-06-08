import { Link } from "react-router-dom";
import { GraduationCap, Briefcase, Building2, ShieldCheck, ArrowRight, LogIn } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";

export default function LoginChooser() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-info/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center">
            <img src={sijilLogo} alt="SIJIL" className="h-14 w-14 object-contain" />
            <div className="mt-2 text-xl font-semibold tracking-tight">SIJIL</div>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to SIJIL</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose how you use the platform.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <LearnerRoleCard />
          <RoleCard
            icon={Building2}
            title="Institution"
            desc="Manage attestations and verify learner credentials."
            signInTo="/login/institution"
            signUpTo="/signup/institution"
          />
          <RoleCard
            icon={Briefcase}
            title="Recruiter"
            desc="Search and verify evidence-backed candidates."
            signInTo="/login/recruiter"
            signUpTo="/signup/recruiter"
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Secured with decentralized identity and selective disclosure.
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          New to SIJIL?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

function LearnerRoleCard() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <GraduationCap className="h-6 w-6" />
      </div>
      <div className="mt-4 text-lg font-semibold tracking-tight">Learner</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Create an account, complete your profile, then access your dashboard.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link
          to="/signup/learner"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          Create account <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/login/learner"
          className="inline-flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <LogIn className="h-3.5 w-3.5" /> Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}

function RoleCard({
  icon: Icon, title, desc, signInTo, signUpTo,
}: {
  icon: typeof GraduationCap;
  title: string;
  desc: string;
  signInTo: string;
  signUpTo: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-4 text-lg font-semibold tracking-tight">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Link
          to={signInTo}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <LogIn className="h-4 w-4" /> Sign in
        </Link>
        <Link
          to={signUpTo}
          className="inline-flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Create account <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

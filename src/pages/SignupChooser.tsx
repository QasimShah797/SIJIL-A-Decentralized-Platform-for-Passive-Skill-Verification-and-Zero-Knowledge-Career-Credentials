import { Link } from "react-router-dom";
import { GraduationCap, Briefcase, Building2, ShieldCheck, ArrowRight } from "lucide-react";
import sijilLogo from "@/assets/sijil-logo.png";
import { DECENTRALIZED_NOTE } from "@/lib/email-rules";

export default function SignupChooser() {
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
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose how you'll use SIJIL.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <RoleCard
            to="/signup/learner"
            icon={GraduationCap}
            title="I'm a Learner"
            desc="Collect verified evidence of your skills and hold portable credentials."
            cta="Sign up as Learner"
          />
          <RoleCard
            to="/signup/institution"
            icon={Building2}
            title="I'm an Institution"
            desc="Register with your official institution domain email — verified automatically."
            cta="Register Institution"
          />
          <RoleCard
            to="/signup/recruiter"
            icon={Briefcase}
            title="I'm a Recruiter"
            desc="Search and verify evidence-backed candidates. Work email recommended."
            cta="Sign up as Recruiter"
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/95 p-4 text-xs text-muted-foreground shadow-sm backdrop-blur sm:p-5">
          {DECENTRALIZED_NOTE}
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          SIJIL protects learner evidence and credentials through trust-based verification and selective disclosure.
        </div>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  to, icon: Icon, title, desc, cta,
}: { to: string; icon: typeof GraduationCap; title: string; desc: string; cta: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-4 text-lg font-semibold tracking-tight">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

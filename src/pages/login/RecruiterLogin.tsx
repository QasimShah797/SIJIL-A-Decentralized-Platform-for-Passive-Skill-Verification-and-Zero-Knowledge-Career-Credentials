import { Link } from "react-router-dom";
import { ArrowLeft, Briefcase, LockKeyhole } from "lucide-react";
import { RecruiterAuthLayout } from "@/components/auth/RecruiterAuthLayout";
import { RecruiterSignInForm } from "@/components/auth/RecruiterSignInForm";

export default function RecruiterLogin() {
  return (
    <RecruiterAuthLayout>
      <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] backdrop-blur sm:p-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to role selection
        </Link>

        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Briefcase className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Recruiter Sign In</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your provisioned recruiter credentials.
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 p-4">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Recruiter accounts are created by SIJIL administrators in Supabase. There is no public
            registration — use the email and password provided to your organization.
          </p>
        </div>

        <RecruiterSignInForm />
      </div>
    </RecruiterAuthLayout>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME } from "@/lib/auth-helpers";
import { verifyRecruiterAccess } from "@/lib/recruiter-auth";
import { formatSupabaseError } from "@/lib/utils";

const REMEMBER_EMAIL_KEY = "sijil.recruiterRememberedEmail";

type RecruiterSignInFormProps = {
  embedded?: boolean;
};

export function RecruiterSignInForm({ embedded = false }: RecruiterSignInFormProps) {
  const navigate = useNavigate();
  const { user, loading, rolesReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyRecruiterAccess(user.id).then((result) => {
      if (result.ok) navigate(ROLE_HOME.recruiter, { replace: true });
    });
  }, [user, loading, rolesReady, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "Password is required", variant: "destructive" });
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        toast({
          title: "Invalid credentials",
          description: "The email or password is incorrect. Please try again.",
          variant: "destructive",
        });
        return;
      }
      if (!data?.user) return;

      const access = await verifyRecruiterAccess(data.user.id);
      if (!access.ok) {
        await supabase.auth.signOut();
        if (access.reason === "wrong_role") {
          toast({
            title: "Recruiter access denied",
            description:
              "This account does not have recruiter access. Recruiter accounts are provisioned by SIJIL.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Recruiter profile missing",
            description:
              "Your account is missing a recruiter profile. Contact your SIJIL administrator.",
            variant: "destructive",
          });
        }
        return;
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      toast({ title: "Signed in", description: "Welcome to the recruiter portal." });
      navigate(ROLE_HOME.recruiter, { replace: true });
    } catch (err) {
      toast({
        title: "Sign-in failed",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-recruiter-note flex items-start gap-2">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        <span>
          Recruiter accounts are invitation-only and provisioned by SIJIL administrators.
        </span>
      </div>

      <form onSubmit={submit} className="auth-form-stack">
        <div>
          <label htmlFor="recruiter-signin-email" className="auth-field-label">
            Work email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="recruiter-signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input pl-9"
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="recruiter-signin-password" className="auth-field-label">
            Password
          </label>
          <PasswordInput
            id="recruiter-signin-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            className="auth-input"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              id="recruiter-remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <span>Remember me</span>
          </label>
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="auth-forgot-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" disabled={busy} className="auth-submit-btn">
          {busy ? "Signing in…" : "Sign in securely"}
          {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </form>

      {!embedded && (
        <div className="mt-6 space-y-3 border-t border-border/60 pt-5">
          <p className="auth-signup-link">
            Not a recruiter?{" "}
            <Link to="/login/learner">Learner sign in</Link>
          </p>
        </div>
      )}

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={email} />
    </>
  );
}

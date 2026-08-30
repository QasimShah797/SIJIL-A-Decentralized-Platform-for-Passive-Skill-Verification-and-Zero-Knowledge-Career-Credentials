import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Mail, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AuthSocialLogin } from "@/components/auth/AuthSocialLogin";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME } from "@/lib/auth-helpers";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { formatSupabaseError } from "@/lib/utils";

const REMEMBER_EMAIL_KEY = "sijil.rememberedEmail";

type LearnerSignInFormProps = {
  onSwitchToSignup?: () => void;
  showSignupLink?: boolean;
  showSocialLogin?: boolean;
};

export function LearnerSignInForm({
  onSwitchToSignup,
  showSignupLink = true,
  showSocialLogin = false,
}: LearnerSignInFormProps) {
  const navigate = useNavigate();
  const { user, loading, rolesReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
      setRememberedEmail(saved);
    }
  }, []);

  const dismissRememberedEmail = () => {
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
    setRememberedEmail(null);
    setEmail("");
    setRememberMe(false);
  };

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyLearnerAccess(user.id).then((result) => {
      if (!result.ok) return;
      navigate(result.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile", {
        replace: true,
      });
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

      const access = await verifyLearnerAccess(data.user.id);
      if (!access.ok) {
        await supabase.auth.signOut();
        if (access.reason === "wrong_role") {
          toast({
            title: "Wrong account type",
            description: "This account is not a learner account.",
            variant: "destructive",
          });
        } else if (access.reason === "no_profile") {
          toast({
            title: "Profile setup required",
            description: "Please complete learner sign up to create your SIJIL profile.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sign-in failed",
            description: "This account cannot access the learner portal.",
            variant: "destructive",
          });
        }
        return;
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail);
        setRememberedEmail(trimmedEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        setRememberedEmail(null);
      }

      toast({ title: "Signed in" });
      navigate(access.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile", {
        replace: true,
      });
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
      <form onSubmit={submit} className="auth-form-stack">
        {rememberedEmail && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate text-foreground">
                Signing in as <span className="font-medium">{rememberedEmail}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={dismissRememberedEmail}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear remembered email"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div>
          <label htmlFor="learner-signin-email" className="auth-field-label">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="learner-signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input pl-9"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="learner-signin-password" className="auth-field-label">
            Password
          </label>
          <PasswordInput
            id="learner-signin-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            className="auth-input"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              id="learner-remember"
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

      {showSocialLogin && <AuthSocialLogin />}

      {showSignupLink && onSwitchToSignup && (
        <p className="auth-signup-link">
          New to SIJIL?{" "}
          <button type="button" onClick={onSwitchToSignup}>
            Create your professional identity
          </button>
        </p>
      )}

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={email} />
    </>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

export function LearnerSignInForm({ onSwitchToSignup, showSignupLink = true }: LearnerSignInFormProps) {
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
        } else if (access.reason === "not_activated") {
          toast({
            title: "Account not activated",
            description:
              "Please activate your account using the activation link provided by your institution.",
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
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
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
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="learner-signin-email">Email</Label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="learner-signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl pl-9"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="learner-signin-password">Password</Label>
          <div className="mt-1.5">
            <PasswordInput
              id="learner-signin-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
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
            className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" disabled={busy} className="w-full rounded-xl shadow-md">
          <ShieldCheck className="mr-2 h-4 w-4" />
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {showSignupLink && onSwitchToSignup && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            Create account
          </button>
        </p>
      )}

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={email} />
    </>
  );
}

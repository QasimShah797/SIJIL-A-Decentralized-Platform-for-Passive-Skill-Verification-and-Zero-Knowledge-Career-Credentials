import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowRight, Mail, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AuthSocialLogin } from "@/components/auth/AuthSocialLogin";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field } from "@/components/sijil/Field";
import { PasswordRequirements } from "@/components/sijil/PasswordRequirements";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { confirmLearnerSignup, resendLearnerSignupConfirmation, signupLearner, LearnerSignupError } from "@/lib/learner-signup";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { formatSupabaseError } from "@/lib/utils";

const SignupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(120),
    email: z.string().trim().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FieldErrors = Partial<Record<keyof z.infer<typeof SignupSchema>, string>>;

type LearnerSignUpFormProps = {
  onSwitchToSignin?: () => void;
  showSigninLink?: boolean;
};

export function LearnerSignUpForm({ onSwitchToSignin, showSigninLink = true }: LearnerSignUpFormProps) {
  const navigate = useNavigate();
  const { user, loading, rolesReady, refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [confirmationError, setConfirmationError] = useState("");

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyLearnerAccess(user.id).then((result) => {
      if (!result.ok) return;
      navigate(result.profileComplete ? "/learner/profile" : "/learner/complete-profile", {
        replace: true,
      });
    });
  }, [user, loading, rolesReady, navigate]);

  const finishSignup = async () => {
    await refreshRoles();
    toast({
      title: "Account created",
      description: "Welcome to SIJIL. Complete your profile to get started.",
    });
    navigate("/learner/complete-profile", { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const parsed = SignupSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast({
        title: "Please fix the highlighted fields",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setErrors({});
    setBusy(true);

    try {
      const result = await signupLearner({
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (result.status === "confirmation_required") {
        setPendingEmail(result.email);
        setPassword("");
        setConfirmPassword("");
        return;
      }
      await finishSignup();
    } catch (err) {
      if (err instanceof LearnerSignupError) {
        if (err.field === "email" || err.field === "password" || err.field === "fullName") {
          setErrors({ [err.field]: err.message });
        }
        toast({ title: "Sign up failed", description: err.message, variant: "destructive" });
        return;
      }
      const message = err instanceof Error ? err.message : formatSupabaseError(err);
      toast({ title: "Sign up failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clearError = (key: keyof FieldErrors) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  if (pendingEmail) {
    const confirm = async (resend: boolean) => {
      if (busy) return;
      setBusy(true);
      setConfirmationError("");
      try {
        if (resend) {
          await resendLearnerSignupConfirmation(pendingEmail);
          setCode("");
          toast({ title: "Confirmation email sent" });
        } else {
          await confirmLearnerSignup(pendingEmail, code.trim(), fullName);
          await finishSignup();
        }
      } catch (error) {
        setConfirmationError(error instanceof LearnerSignupError ? error.message : "Could not complete email confirmation. Try again.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <form className="auth-form-stack" onSubmit={(event) => { event.preventDefault(); void confirm(false); }}>
        <h2 className="text-lg font-semibold">Verify your email</h2>
        <p className="text-sm text-muted-foreground">
          Check {pendingEmail}. Enter the code from the email, or open its confirmation link and sign in.
        </p>
        <Field label="Verification code" required>
          <Input aria-label="Verification code" className="auth-input" value={code}
            onChange={(event) => setCode(event.target.value)} inputMode="numeric"
            autoComplete="one-time-code" pattern="[0-9]+" required />
        </Field>
        {confirmationError && <p role="alert" className="text-sm text-destructive">{confirmationError}</p>}
        <button className="auth-submit-btn" type="submit" disabled={busy || !code.trim()}>Verify email</button>
        <button type="button" disabled={busy} className="text-sm text-primary underline" onClick={() => void confirm(true)}>Resend confirmation email</button>
        {onSwitchToSignin && <button type="button" className="text-sm text-primary underline" onClick={onSwitchToSignin}>Go to sign in</button>}
      </form>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="auth-form-stack">
        <Field label="Full name" required>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearError("fullName");
              }}
              className={`auth-input pl-9 ${errors.fullName ? "border-destructive" : ""}`}
              placeholder="Your full name"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
            />
          </div>
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </Field>

        <Field label="Email" required>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError("email");
              }}
              className={`auth-input pl-9 ${errors.email ? "border-destructive" : ""}`}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </Field>

        <Field label="Password" required>
          <PasswordInput
            id="learner-signup-password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              clearError("password");
            }}
            autoComplete="new-password"
            invalid={!!errors.password}
            className="auth-input"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
          <PasswordRequirements password={password} />
        </Field>

        <Field label="Confirm password" required>
          <PasswordInput
            id="learner-signup-confirm-password"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              clearError("confirmPassword");
            }}
            autoComplete="new-password"
            invalid={!!errors.confirmPassword}
            className="auth-input"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
          )}
        </Field>

        <button type="submit" disabled={busy} className="auth-submit-btn">
          {busy ? "Creating account…" : "Create your identity"}
          {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </form>

      <AuthSocialLogin />

      {showSigninLink && onSwitchToSignin && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignin}
            className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            Sign in
          </button>
        </p>
      )}
    </>
  );
}

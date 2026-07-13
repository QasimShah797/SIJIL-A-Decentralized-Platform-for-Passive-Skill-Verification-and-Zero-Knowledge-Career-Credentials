import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Mail, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field } from "@/components/sijil/Field";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { signupLearner, LearnerSignupError } from "@/lib/learner-signup";
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

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyLearnerAccess(user.id).then((result) => {
      if (!result.ok) return;
      navigate(result.profileComplete ? "/learner/profile" : "/learner/complete-profile", {
        replace: true,
      });
    });
  }, [user, loading, rolesReady, navigate]);

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
      await signupLearner({
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
      });

      await refreshRoles();

      toast({
        title: "Account created",
        description: "Welcome to SIJIL. Complete your profile to get started.",
      });
      navigate("/learner/complete-profile", { replace: true });
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

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearError("fullName");
              }}
              className={`rounded-xl pl-9 ${errors.fullName ? "border-destructive" : ""}`}
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
              className={`rounded-xl pl-9 ${errors.email ? "border-destructive" : ""}`}
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
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
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
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
          )}
        </Field>

        <Button type="submit" disabled={busy} className="w-full rounded-xl shadow-md">
          <UserPlus className="mr-2 h-4 w-4" />
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

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

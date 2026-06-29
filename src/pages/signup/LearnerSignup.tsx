import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, GraduationCap, Lock, Mail, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/sijil/Field";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { signupLearner, LearnerSignupError } from "@/lib/learner-signup";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { formatSupabaseError } from "@/lib/utils";
import sijilLogo from "@/assets/sijil-logo.png";

const SignupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(120),
    email: z.string().trim().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    institutionName: z.string().trim().max(200).optional(),
    program: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FieldErrors = Partial<Record<keyof z.infer<typeof SignupSchema>, string>>;

export default function LearnerSignup() {
  const navigate = useNavigate();
  const { user, loading, rolesReady, refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [program, setProgram] = useState("");

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
      institutionName: institutionName || undefined,
      program: program || undefined,
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
        institutionName: parsed.data.institutionName,
        program: parsed.data.program,
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div className="relative w-full max-w-lg">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center">
            <img src={sijilLogo} alt="SIJIL" className="h-16 w-16 object-contain" />
            <div className="mt-3 text-xl font-semibold tracking-tight">SIJIL</div>
          </Link>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-lg sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Create Your SIJIL Identity</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Create your learner-owned SIJIL account. Complete your profile after signup to start
            building your verified competency portfolio.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <User className="h-4 w-4 text-primary" /> Account details
              </div>

              <Field label="Full Name" required>
                <Input
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    clearError("fullName");
                  }}
                  placeholder="Ali Khan"
                  autoComplete="name"
                  aria-invalid={!!errors.fullName}
                  className={errors.fullName ? "border-destructive" : ""}
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>
                )}
              </Field>

              <Field label="Email Address" required>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearError("email");
                    }}
                    className={`pl-9 ${errors.email ? "border-destructive" : ""}`}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password" required>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError("password");
                      }}
                      className={`pl-9 ${errors.password ? "border-destructive" : ""}`}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                    />
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">{errors.password}</p>
                  )}
                </Field>

                <Field label="Confirm Password" required>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearError("confirmPassword");
                      }}
                      className={`pl-9 ${errors.confirmPassword ? "border-destructive" : ""}`}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      aria-invalid={!!errors.confirmPassword}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
                  )}
                </Field>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <GraduationCap className="h-4 w-4 text-primary" /> Education{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </div>

              <Field label="Current Institution" hint="You can update this later">
                <Input
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="University or school name"
                />
              </Field>

              <Field label="Program / Degree">
                <Input
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder="e.g. BSc Computer Science"
                />
              </Field>
            </section>

            <Button type="submit" disabled={busy} className="w-full">
              <UserPlus className="mr-2 h-4 w-4" />
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login/learner" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

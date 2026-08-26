import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Lock, ArrowLeft, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { FieldRow } from "@/components/sijil/FieldRow";
import { PasswordRequirements } from "@/components/sijil/PasswordRequirements";
import { CardSurface } from "@/components/sijil/CardSurface";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isApiEnabled } from "@/services/api/client";
import {
  activateStudentAccount,
  previewStudentActivation,
  type ActivationPreview,
} from "@/services/api/student-activation.api";
import { formatSupabaseError } from "@/lib/utils";
import sijilLogo from "@/assets/sijil-logo.png";

export default function ActivateAccount() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Missing activation token. Use the link from your institution.");
      setLoading(false);
      return;
    }
    if (!isApiEnabled()) {
      setLoadError("Backend API is not configured. Contact your administrator.");
      setLoading(false);
      return;
    }

    previewStudentActivation(token)
      .then(setPreview)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || busy) return;

    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const { universityEmail } = await activateStudentAccount({
        token,
        password,
        confirmPassword,
      });

      const { error } = await supabase.auth.signInWithPassword({
        email: universityEmail,
        password,
      });
      if (error) throw error;

      toast({ title: "Account activated", description: "Complete your profile to access SIJIL." });
      navigate("/learner/complete-profile", { replace: true });
    } catch (err) {
      toast({
        title: "Activation failed",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicSurfaceLayout className="flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-lg">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <img src={sijilLogo} alt="SIJIL" className="h-16 w-16 object-contain" />
          <div className="mt-3 text-xl font-semibold tracking-tight">SIJIL</div>
          <div className="mt-1 text-sm text-muted-foreground">First-time account activation</div>
        </div>

        <CardSurface variant="elevated" className="sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Activate Your SIJIL Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your password to activate the account created by your institution. This is not normal login.
          </p>

          {loading && <p className="mt-6 text-sm text-muted-foreground">Validating activation link…</p>}

          {loadError && (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {loadError}
            </div>
          )}

          {preview && (
            <>
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  Verified student details
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4">
                  <FieldRow label="Full name" value={preview.fullName} />
                  <FieldRow label="University email" value={preview.universityEmail} />
                  <FieldRow label="Registration number" value={preview.registrationNumber} />
                  <FieldRow label="Institution" value={preview.institutionName} />
                  <FieldRow label="Department" value={preview.department} />
                  <FieldRow label="Program" value={preview.program} />
                  <FieldRow label="Batch / semester" value={preview.batchSemester} className="border-0" />
                </div>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="password">New password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl pl-9"
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
                  <PasswordRequirements password={password} />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="rounded-xl pl-9"
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full rounded-xl">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {busy ? "Activating…" : "Activate account"}
                </Button>
              </form>
            </>
          )}
        </CardSurface>
      </div>
    </PublicSurfaceLayout>
  );
}

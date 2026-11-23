import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { completeLearnerSignupAfterEmailVerification } from "@/lib/learner-signup";
import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_MS,
  clearPendingSignupEmail,
  isEmailVerifiedUser,
  isValidOtpCode,
  maskEmail,
  readPendingSignupEmail,
  rememberPendingSignupEmail,
  resendSignupEmailOtp,
  verifySignupEmailOtp,
} from "@/lib/email-verification";

type LearnerVerifyEmailFormProps = {
  initialEmail?: string;
};

export function LearnerVerifyEmailForm({ initialEmail = "" }: LearnerVerifyEmailFormProps) {
  const navigate = useNavigate();
  const { refreshRoles, user } = useAuth();
  const [email, setEmail] = useState(() => (
    initialEmail.trim().toLowerCase() || readPendingSignupEmail() || ""
  ));
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldownMs, setCooldownMs] = useState(0);

  useEffect(() => {
    if (email) rememberPendingSignupEmail(email);
  }, [email]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownMs((current) => Math.max(0, current - 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownMs]);

  useEffect(() => {
    if (!user || !isEmailVerifiedUser(user)) return;
    let cancelled = false;
    void (async () => {
      try {
        await completeLearnerSignupAfterEmailVerification(user.id);
        await refreshRoles();
        if (cancelled) return;
        const access = await verifyLearnerAccess(user.id);
        if (cancelled || !access.ok) return;
        clearPendingSignupEmail();
        navigate(access.profileComplete ? "/learner/profile" : "/learner/complete-profile", {
          replace: true,
        });
      } catch {
        // Stay on verify screen if bootstrap fails; user can retry OTP path.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshRoles, navigate]);

  const cooldownSeconds = useMemo(() => Math.ceil(cooldownMs / 1000), [cooldownMs]);

  const submit = useCallback(async () => {
    if (busy) return;
    setError("");

    if (!email.trim()) {
      setError("Enter the email you used to sign up.");
      return;
    }
    if (!isValidOtpCode(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setBusy(true);
    try {
      // Intentionally do not log `otp`.
      const verifiedUser = await verifySignupEmailOtp(email, otp);
      await completeLearnerSignupAfterEmailVerification(verifiedUser.id);
      await refreshRoles();
      const access = await verifyLearnerAccess(verifiedUser.id);
      toast({
        title: "Email verified",
        description: "Your SIJIL learner account is ready. Complete your profile to continue.",
      });
      navigate(
        access.ok && access.profileComplete ? "/learner/profile" : "/learner/complete-profile",
        { replace: true },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not verify the code.";
      setError(message);
      toast({ title: "Verification failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [busy, email, otp, navigate, refreshRoles]);

  const resend = async () => {
    if (resendBusy || cooldownMs > 0) return;
    if (!email.trim()) {
      setError("Enter the email you used to sign up.");
      return;
    }
    setResendBusy(true);
    setError("");
    try {
      await resendSignupEmailOtp(email);
      setCooldownMs(OTP_RESEND_COOLDOWN_MS);
      toast({
        title: "Code sent",
        description: `A new verification code was sent to ${maskEmail(email)}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not resend the code.";
      setError(message);
      if (message.toLowerCase().includes("wait") || message.toLowerCase().includes("rate")) {
        setCooldownMs(OTP_RESEND_COOLDOWN_MS);
      }
      toast({ title: "Could not resend", description: message, variant: "destructive" });
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <AuthEntryLayout>
      <p className="auth-page-eyebrow">Secure sign up</p>
      <h1 className="auth-page-title">Verify your email</h1>
      <p className="auth-page-subtitle">
        Enter the 6-digit code we sent to{" "}
        <span className="font-medium text-foreground">
          {email ? maskEmail(email) : "your inbox"}
        </span>
        . You need this before accessing your learner account.
      </p>

      <form
        className="auth-form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {!initialEmail && !readPendingSignupEmail() ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="auth-input pl-9"
                autoComplete="email"
                aria-label="Signup email"
                required
              />
            </div>
          </label>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="learner-signup-otp" className="text-sm font-medium text-foreground">
            Verification code
          </label>
          <InputOTP
            id="learner-signup-otp"
            maxLength={OTP_LENGTH}
            value={otp}
            onChange={setOtp}
            disabled={busy}
            containerClassName="justify-center gap-2 sm:gap-3"
            aria-label="Six-digit email verification code"
            autoFocus
          >
            <InputOTPGroup className="gap-2 sm:gap-3">
              {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="h-12 w-10 rounded-lg border border-input text-base first:rounded-lg first:border-l last:rounded-lg sm:h-12 sm:w-11"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error ? (
            <p className="text-center text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Codes expire quickly. Use the latest email from SIJIL.
            </p>
          )}
        </div>

        <button type="submit" disabled={busy || otp.length !== OTP_LENGTH} className="auth-submit-btn">
          {busy ? "Verifying…" : "Verify email"}
          {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </form>

      <div className="mt-5 space-y-3 text-center text-sm text-muted-foreground">
        <button
          type="button"
          className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
          onClick={() => void resend()}
          disabled={resendBusy || cooldownMs > 0 || !email.trim()}
        >
          {resendBusy
            ? "Sending…"
            : cooldownMs > 0
              ? `Resend code in ${cooldownSeconds}s`
              : "Resend code"}
        </button>
        <p>
          Wrong email?{" "}
          <Link to="/signup/learner" className="font-medium text-primary hover:underline">
            Start over
          </Link>
          {" · "}
          <Link to="/login/learner" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthEntryLayout>
  );
}

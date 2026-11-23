import { Link } from "react-router-dom";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { AdminSignInForm } from "@/components/auth/AdminSignInForm";

export default function AdminLogin() {
  return (
    <AuthEntryLayout>
      <p className="auth-page-eyebrow">Administrator</p>
      <h1 className="auth-page-title">SIJIL admin sign in</h1>
      <p className="auth-page-subtitle">
        For platform operators only. Prefer Continue with Google if this admin account was created
        with Google. This is sign-in only — it does not connect Google Calendar.
      </p>
      <div className="mt-6">
        <AdminSignInForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/" className="underline underline-offset-2 hover:text-foreground">
          Back to SIJIL
        </Link>
      </p>
    </AuthEntryLayout>
  );
}

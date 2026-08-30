import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { AuthRoleSelector } from "@/components/auth/AuthRoleSelector";
import { AuthSecureFooter } from "@/components/auth/AuthSecureFooter";
import { LearnerSignInForm } from "@/components/auth/LearnerSignInForm";
import { LearnerSignUpForm } from "@/components/auth/LearnerSignUpForm";
import { RecruiterSignInForm } from "@/components/auth/RecruiterSignInForm";

export type AuthRole = "learner" | "recruiter";
export type LearnerTab = "signin" | "signup";

export type AuthEntryConfig = {
  role?: AuthRole | null;
  learnerTab?: LearnerTab;
};

function resolveConfig(pathname: string, config?: AuthEntryConfig): Required<AuthEntryConfig> {
  if (config?.role) {
    return {
      role: config.role,
      learnerTab: config.learnerTab ?? "signin",
    };
  }

  if (pathname === "/signup/learner") {
    return { role: "learner", learnerTab: "signup" };
  }
  if (pathname === "/login/recruiter") {
    return { role: "recruiter", learnerTab: "signin" };
  }
  if (pathname === "/" || pathname === "/login/learner") {
    return { role: "learner", learnerTab: "signin" };
  }

  return { role: "learner", learnerTab: "signin" };
}

type AuthEntryProps = AuthEntryConfig;

export default function AuthEntry(props: AuthEntryProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, learnerTab } = useMemo(
    () => resolveConfig(location.pathname, props),
    [location.pathname, props.role, props.learnerTab],
  );

  const isSignup = learnerTab === "signup";

  const goLearnerTab = (tab: LearnerTab) => {
    navigate(tab === "signup" ? "/signup/learner" : "/login/learner", { replace: true });
  };

  const selectRole = (nextRole: AuthRole) => {
    if (nextRole === "recruiter") {
      navigate("/login/recruiter", { replace: true });
      return;
    }
    navigate(isSignup ? "/signup/learner" : "/login/learner", { replace: true });
  };

  return (
    <AuthEntryLayout>
      <p className="auth-page-eyebrow">Secure sign in</p>
      <h1 className="auth-page-title">
        {isSignup ? "Create your SIJIL identity" : "Continue to SIJIL"}
      </h1>
      <p className="auth-page-subtitle">
        {isSignup
          ? "Join as a learner — connect evidence and build verified credentials."
          : "Choose your workspace — build verified skills or review candidate evidence."}
      </p>

      <div className="auth-page-section">
        <AuthRoleSelector role={role} onSelect={selectRole} />
      </div>

      <div className="auth-page-section">
        {role === "learner" && !isSignup && (
          <LearnerSignInForm
            onSwitchToSignup={() => goLearnerTab("signup")}
            showSignupLink
            showSocialLogin
          />
        )}

        {role === "learner" && isSignup && (
          <LearnerSignUpForm showSigninLink={false} />
        )}

        {role === "recruiter" && (
          <>
            <RecruiterSignInForm embedded />
            <AuthSecureFooter />
          </>
        )}
      </div>

      {!isSignup && role === "learner" && <AuthSecureFooter />}
      {isSignup && (
        <>
          <p className="auth-signup-link">
            Already have an account?{" "}
            <button type="button" onClick={() => goLearnerTab("signin")}>
              Sign in securely
            </button>
          </p>
          <AuthSecureFooter />
        </>
      )}
    </AuthEntryLayout>
  );
}

import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, GraduationCap } from "lucide-react";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { LearnerSignInForm } from "@/components/auth/LearnerSignInForm";
import { LearnerSignUpForm } from "@/components/auth/LearnerSignUpForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
  if (pathname === "/login/learner") {
    return { role: "learner", learnerTab: "signin" };
  }
  if (pathname === "/login/recruiter") {
    return { role: "recruiter", learnerTab: "signin" };
  }

  return { role: null, learnerTab: "signin" };
}

type AuthEntryProps = AuthEntryConfig;

export default function AuthEntry(props: AuthEntryProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, learnerTab } = useMemo(
    () => resolveConfig(location.pathname, props),
    [location.pathname, props.role, props.learnerTab],
  );

  const goLearnerTab = (tab: LearnerTab) => {
    navigate(tab === "signup" ? "/signup/learner" : "/login/learner", { replace: true });
  };

  const selectRole = (nextRole: AuthRole) => {
    if (nextRole === "recruiter") {
      navigate("/login/recruiter", { replace: true });
      return;
    }
    navigate("/login/learner", { replace: true });
  };

  return (
    <AuthEntryLayout>
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-lg sm:p-8 elevated-panel">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Secure sign in</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Continue to SIJIL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your workspace — build verified skills or review candidate evidence.
        </p>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-foreground">I am a</p>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Select role">
            {(
              [
                {
                  id: "learner" as const,
                  label: "Learner",
                  icon: GraduationCap,
                  hint: "Build and share verified skills",
                },
                {
                  id: "recruiter" as const,
                  label: "Recruiter",
                  icon: Briefcase,
                  hint: "Verify candidate credentials",
                },
              ] as const
            ).map(({ id, label, icon: Icon, hint }) => {
              const selected = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectRole(id)}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-2xl border px-4 py-6 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-primary bg-primary/5 text-primary shadow-md ring-1 ring-primary/20"
                      : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
                      selected ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <span className="text-base font-semibold text-foreground">{label}</span>
                  <span className="text-xs font-normal leading-snug text-muted-foreground">{hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={cn(
            "mt-6 transition-all duration-300",
            role ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2",
          )}
        >
          {role === "learner" && (
            <Tabs
              value={learnerTab}
              onValueChange={(value) => goLearnerTab(value as LearnerTab)}
              className="w-full"
            >
              <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl border border-border/60 bg-muted/50 p-1 shadow-inner">
                <TabsTrigger
                  value="signin"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Sign in
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Sign up
                </TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-5 focus-visible:outline-none">
                <LearnerSignInForm
                  onSwitchToSignup={() => goLearnerTab("signup")}
                  showSignupLink
                />
              </TabsContent>
              <TabsContent value="signup" className="mt-5 focus-visible:outline-none">
                <LearnerSignUpForm
                  onSwitchToSignin={() => goLearnerTab("signin")}
                  showSigninLink
                />
              </TabsContent>
            </Tabs>
          )}
        </div>

        {!role && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Select Learner or Recruiter to continue.
          </p>
        )}
      </div>
    </AuthEntryLayout>
  );
}

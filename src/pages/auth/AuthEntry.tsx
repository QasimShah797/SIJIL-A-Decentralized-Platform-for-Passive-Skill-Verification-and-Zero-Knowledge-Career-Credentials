import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, GraduationCap } from "lucide-react";
import { AuthEntryLayout } from "@/components/auth/AuthEntryLayout";
import { LearnerSignInForm } from "@/components/auth/LearnerSignInForm";
import { LearnerSignUpForm } from "@/components/auth/LearnerSignUpForm";
import { RecruiterSignInForm } from "@/components/auth/RecruiterSignInForm";
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
    navigate(nextRole === "recruiter" ? "/login/recruiter" : "/login/learner", { replace: true });
  };

  return (
    <AuthEntryLayout>
      <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] backdrop-blur sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Continue to SIJIL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your role to sign in or create a learner account.
        </p>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-foreground">I am a</p>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Select role">
            {(
              [
                { id: "learner" as const, label: "Learner", icon: GraduationCap },
                { id: "recruiter" as const, label: "Recruiter", icon: Briefcase },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const selected = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectRole(id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
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
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted/70 p-1">
                <TabsTrigger value="signin" className="rounded-lg">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg">
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

          {role === "recruiter" && (
            <div className="animate-fade-in">
              <RecruiterSignInForm />
            </div>
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

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Lock, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  type AppRole,
  fetchUserRoles,
  resolvePostAuthRedirectForRole,
} from "@/lib/auth-helpers";
import { formatSupabaseError } from "@/lib/utils";
import sijilLogo from "@/assets/sijil-logo.png";

const ROLE_LABEL: Record<AppRole, string> = {
  learner: "Learner",
  recruiter: "Recruiter",
  institution: "Institution",
  admin: "Admin",
};

const ROLE_SIGNUP: Record<AppRole, string> = {
  learner: "/signup/learner",
  recruiter: "/signup/recruiter",
  institution: "/signup/institution",
  admin: "/signup",
};

export default function RoleLogin({ role }: { role: AppRole }) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    fetchUserRoles(user.id).then(async (roles) => {
      if (!roles.includes(role)) return;
      try {
        const path = await resolvePostAuthRedirectForRole(user.id, role);
        navigate(path, { replace: true });
      } catch {
        /* wrong role — stay on login form */
      }
    });
  }, [user, loading, role, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Email and password required", variant: "destructive" });
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.user) return;

      const roles = await fetchUserRoles(data.user.id);
      if (!roles.includes(role)) {
        await supabase.auth.signOut();
        toast({
          title: "Wrong account type",
          description: `This email is not registered as a ${ROLE_LABEL[role]}. Use the correct sign-in option or create a new account.`,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Signed in" });
      const path = await resolvePostAuthRedirectForRole(data.user.id, role);
      navigate(path, { replace: true });
    } catch (err) {
      toast({ title: "Sign-in failed", description: formatSupabaseError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const label = ROLE_LABEL[role];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-info/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to sign-in options
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center">
            <img src={sijilLogo} alt="SIJIL" className="h-16 w-16 object-contain" />
            <div className="mt-3 text-xl font-semibold tracking-tight">SIJIL</div>
          </Link>
          <div className="mt-1 text-sm text-muted-foreground">Sign in as {label}</div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] backdrop-blur sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your {label.toLowerCase()} account credentials.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="you@institution.edu"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <ShieldCheck className="mr-2 h-4 w-4" /> Sign in as {label}
            </Button>
          </form>

          {role === "learner" && (
            <p className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
              New learner?{" "}
              <Link to="/signup/learner" className="font-medium text-primary hover:underline">
                Create account with username, email & password
              </Link>
              {" "}— then complete your profile to access the dashboard.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don't have a {label.toLowerCase()} account?{" "}
          <Link to={ROLE_SIGNUP[role]} className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

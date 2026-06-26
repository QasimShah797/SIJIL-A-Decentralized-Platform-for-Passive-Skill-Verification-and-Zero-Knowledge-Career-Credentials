import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Lock, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { ROLE_HOME } from "@/lib/auth-helpers";
import { formatSupabaseError } from "@/lib/utils";
import sijilLogo from "@/assets/sijil-logo.png";

export default function LearnerLogin() {
  const navigate = useNavigate();
  const { user, loading, rolesReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyLearnerAccess(user.id).then((result) => {
      if (!result.ok) return;
      navigate(result.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile", {
        replace: true,
      });
    });
  }, [user, loading, rolesReady, navigate]);

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
      if (error) {
        toast({
          title: "Invalid credentials",
          description: "The email or password is incorrect. Please try again.",
          variant: "destructive",
        });
        return;
      }
      if (!data?.user) return;

      const access = await verifyLearnerAccess(data.user.id);
      if (!access.ok) {
        await supabase.auth.signOut();
        if (access.reason === "wrong_role") {
          toast({
            title: "Wrong account type",
            description: "This account is not a learner account.",
            variant: "destructive",
          });
        } else if (access.reason === "not_activated") {
          toast({
            title: "Account not activated",
            description:
              "Please activate your account using the activation link provided by your institution.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Account not provisioned",
            description: "Students must be created by their institution.",
            variant: "destructive",
          });
        }
        return;
      }

      toast({ title: "Signed in" });
      navigate(access.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile", {
        replace: true,
      });
    } catch (err) {
      toast({
        title: "Sign-in failed",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center">
            <img src={sijilLogo} alt="SIJIL" className="h-16 w-16 object-contain" />
            <div className="mt-3 text-xl font-semibold tracking-tight">SIJIL</div>
          </Link>
          <div className="mt-1 text-sm text-muted-foreground">Existing activated students only</div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-lg sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Learner Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your university email and password.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">University email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="student@university.edu"
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

            <Button type="submit" disabled={busy} className="w-full">
              <ShieldCheck className="mr-2 h-4 w-4" /> Sign in
            </Button>
          </form>

          <p className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            New students: use the activation link from your institution first. There is no public learner registration.
          </p>
        </div>
      </div>
    </div>
  );
}

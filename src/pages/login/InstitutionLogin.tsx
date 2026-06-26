import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Lock, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { verifyInstitutionAccess } from "@/lib/institution-auth";
import { formatSupabaseError } from "@/lib/utils";
import sijilLogo from "@/assets/sijil-logo.png";

export default function InstitutionLogin() {
  const navigate = useNavigate();
  const { user, loading, rolesReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user || !rolesReady) return;
    verifyInstitutionAccess(user.id).then((result) => {
      if (result.ok) navigate("/institution/dashboard", { replace: true });
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

      const access = await verifyInstitutionAccess(data.user.id);
      if (!access.ok) {
        await supabase.auth.signOut();
        if (access.reason === "wrong_role") {
          toast({
            title: "Wrong account type",
            description:
              "This email is not registered as an institution account. Use the correct sign-in option or contact SIJIL support.",
            variant: "destructive",
          });
        } else if (access.reason === "inactive") {
          toast({
            title: "Institution account inactive",
            description: "Your institution account is not active yet. Contact SIJIL support.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Institution profile missing",
            description: "Your account is missing an institution profile. Contact SIJIL support.",
            variant: "destructive",
          });
        }
        return;
      }

      toast({ title: "Signed in" });
      navigate("/institution/dashboard", { replace: true });
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
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-info/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="flex flex-col items-center">
            <img src={sijilLogo} alt="SIJIL" className="h-16 w-16 object-contain" />
            <div className="mt-3 text-xl font-semibold tracking-tight">SIJIL</div>
          </Link>
          <div className="mt-1 text-sm text-muted-foreground">Institution sign in</div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-[0_2px_4px_hsl(222_47%_11%/0.04),0_24px_64px_-24px_hsl(222_47%_11%/0.18)] backdrop-blur sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the institution credentials provided by SIJIL.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Institution email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="institution@university.edu"
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
              <ShieldCheck className="mr-2 h-4 w-4" /> Sign in as Institution
            </Button>
          </form>

          <p className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Institution accounts are created by SIJIL. There is no public institution registration.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SignupShell, Field } from "./_shell";
import { useAuth } from "@/hooks/useAuth";
import { DECENTRALIZED_NOTE } from "@/lib/email-rules";
import { createLearnerProfileStub, isUsernameAvailable } from "@/lib/db/learner-profile";
import { formatSupabaseError } from "@/lib/utils";

const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

const Schema = z.object({
  username: z.string().trim().regex(usernameRegex, "3–30 characters: letters, numbers, underscore only"),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

export default function LearnerSignup() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    username: "", email: "", password: "", confirm: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Schema.safeParse(f);
    if (!parsed.success) {
      toast({ title: "Please check the form", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const available = await isUsernameAvailable(f.username);
      if (!available) {
        toast({ title: "Username taken", description: "Please choose a different username.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: {
          emailRedirectTo: `${window.location.origin}/learner/complete-profile`,
          data: { username: f.username.trim() },
        },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (!uid) throw new Error("Account created but session unavailable. Please sign in.");

      const { error: roleError } = await supabase.from("user_roles").insert({ user_id: uid, role: "learner" });
      if (roleError) throw roleError;

      await createLearnerProfileStub(uid, f.username.trim());
      await refreshRoles();

      toast({
        title: "Account created!",
        description: "Complete your profile to access your dashboard.",
      });
      navigate("/learner/complete-profile", { replace: true });
    } catch (err) {
      toast({ title: "Signup failed", description: formatSupabaseError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignupShell title="Create your Learner account" subtitle="Sign up with username, email, and password — then complete your profile." backTo="/login">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Username" required hint="Your public handle on SIJIL">
          <Input value={f.username} onChange={set("username")} placeholder="ali_khan" autoComplete="username" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={f.email} onChange={set("email")} placeholder="you@school.edu" autoComplete="email" />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={f.password} onChange={set("password")} placeholder="At least 8 characters" autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" required>
          <Input type="password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </Field>

        <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
          After signup you'll complete a short 3-step profile before accessing your dashboard.
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          {DECENTRALIZED_NOTE}
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating account…" : "Create account & continue"}
        </Button>
      </form>
    </SignupShell>
  );
}

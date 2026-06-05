import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SignupShell, Field } from "./_shell";
import { useAuth } from "@/hooks/useAuth";
import { DECENTRALIZED_NOTE } from "@/lib/email-rules";

const optUrl = z.string().trim().url("Invalid URL").optional().or(z.literal(""));

const Schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(80),
  lastName: z.string().trim().min(1, "Required").max(80),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
  confirm: z.string(),
  contactNumber: z.string().trim().max(40).optional().or(z.literal("")),
  institutionName: z.string().trim().max(200).optional().or(z.literal("")),
  program: z.string().trim().max(200).optional().or(z.literal("")),
  studentId: z.string().trim().max(80).optional().or(z.literal("")),
  githubUrl: optUrl,
  linkedinUrl: optUrl,
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

export default function LearnerSignup() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    firstName: "", lastName: "", email: "", password: "", confirm: "",
    contactNumber: "", institutionName: "", program: "", studentId: "",
    githubUrl: "", linkedinUrl: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
      const { data, error } = await supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: { emailRedirectTo: `${window.location.origin}/learner/profile` },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("user_roles").insert({ user_id: uid, role: "learner" });
        await supabase.from("learner_profiles").insert({
          user_id: uid,
          first_name: f.firstName, last_name: f.lastName,
          contact_number: f.contactNumber || null,
          institution_name: f.institutionName || null,
          program: f.program || null,
          student_id: f.studentId || null,
          github_url: f.githubUrl || null,
          linkedin_url: f.linkedinUrl || null,
        });
        await refreshRoles();
      }
      toast({ title: "Welcome to SIJIL", description: "Start by linking your evidence or completing your profile." });
      navigate("/learner/profile", { replace: true });
    } catch (err) {
      toast({ title: "Signup failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignupShell title="Create your Learner account" subtitle="Collect verified evidence and hold portable credentials.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required><Input value={f.firstName} onChange={set("firstName")} /></Field>
        <Field label="Last name" required><Input value={f.lastName} onChange={set("lastName")} /></Field>
        <Field label="Email" required><Input type="email" value={f.email} onChange={set("email")} placeholder="you@school.edu" /></Field>
        <Field label="Contact number"><Input value={f.contactNumber} onChange={set("contactNumber")} /></Field>
        <Field label="Password" required><Input type="password" value={f.password} onChange={set("password")} placeholder="At least 8 characters" /></Field>
        <Field label="Confirm password" required><Input type="password" value={f.confirm} onChange={set("confirm")} /></Field>

        <div className="sm:col-span-2 mt-2 border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional</div>

        <Field label="Institution name"><Input value={f.institutionName} onChange={set("institutionName")} /></Field>
        <Field label="Program / Department"><Input value={f.program} onChange={set("program")} /></Field>
        <Field label="Student ID / Roll number"><Input value={f.studentId} onChange={set("studentId")} /></Field>
        <Field label="GitHub profile URL"><Input value={f.githubUrl} onChange={set("githubUrl")} placeholder="https://github.com/..." /></Field>
        <Field label="LinkedIn profile URL"><Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/..." /></Field>

        <div className="sm:col-span-2 rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
          Your account starts as <span className="font-medium text-foreground">Email Verification Pending</span>. After you confirm your email, your status becomes <span className="font-medium text-foreground">Learner Verified</span>.
        </div>

        <div className="sm:col-span-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          {DECENTRALIZED_NOTE}
        </div>

        <div className="sm:col-span-2 mt-2">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating account…" : "Create Learner account"}
          </Button>
        </div>
      </form>
    </SignupShell>
  );
}

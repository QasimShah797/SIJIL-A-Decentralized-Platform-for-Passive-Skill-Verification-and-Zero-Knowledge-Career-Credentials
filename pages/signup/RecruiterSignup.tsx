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

const optUrl = z.string().trim().url("Invalid URL").optional().or(z.literal(""));

const Schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  confirm: z.string(),
  companyName: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().min(1).max(120),
  companyWebsite: optUrl,
  linkedinUrl: optUrl,
  contactNumber: z.string().trim().max(40).optional().or(z.literal("")),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

import { isPersonalEmail, DECENTRALIZED_NOTE } from "@/lib/email-rules";

export default function RecruiterSignup() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    fullName: "", workEmail: "", password: "", confirm: "",
    companyName: "", jobTitle: "", companyWebsite: "", linkedinUrl: "", contactNumber: "", reason: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const isFreeEmail = (email: string) => isPersonalEmail(email);

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
        email: f.workEmail,
        password: f.password,
        options: { emailRedirectTo: `${window.location.origin}/recruiter/search` },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("user_roles").insert({ user_id: uid, role: "recruiter" });
        const limited = isPersonalEmail(f.workEmail);
        await supabase.from("recruiter_profiles").insert({
          user_id: uid,
          full_name: f.fullName,
          work_email: f.workEmail,
          company_name: f.companyName,
          job_title: f.jobTitle,
          company_website: f.companyWebsite || null,
          linkedin_url: f.linkedinUrl || null,
          contact_number: f.contactNumber || null,
          reason: f.reason || null,
          verification_status: limited ? "limited" : "pending",
        });
        await refreshRoles();
      }
      const limited = isPersonalEmail(f.workEmail);
      toast({
        title: "Recruiter account created",
        description: limited
          ? "You signed up with a personal email — your account is marked Limited Recruiter. Use a company email and verify it to unlock full access."
          : "Check your inbox to verify your work email. Once verified, your account becomes Work Email Verified.",
      });
      navigate("/recruiter/search", { replace: true });
    } catch (err) {
      toast({ title: "Signup failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignupShell title="Create your Recruiter account" subtitle="Search and verify evidence-backed candidates. Company verification required.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required><Input value={f.fullName} onChange={set("fullName")} /></Field>
        <Field label="Work email" required hint={isFreeEmail(f.workEmail) ? "Tip: a company email speeds up verification." : undefined}>
          <Input type="email" value={f.workEmail} onChange={set("workEmail")} placeholder="you@company.com" />
        </Field>
        <Field label="Company name" required><Input value={f.companyName} onChange={set("companyName")} /></Field>
        <Field label="Job title / Position" required><Input value={f.jobTitle} onChange={set("jobTitle")} /></Field>
        <Field label="Password" required><Input type="password" value={f.password} onChange={set("password")} placeholder="At least 8 characters" /></Field>
        <Field label="Confirm password" required><Input type="password" value={f.confirm} onChange={set("confirm")} /></Field>

        <div className="sm:col-span-2 mt-2 border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional</div>

        <Field label="Company website"><Input value={f.companyWebsite} onChange={set("companyWebsite")} placeholder="https://company.com" /></Field>
        <Field label="LinkedIn profile URL"><Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/..." /></Field>
        <Field label="Contact number"><Input value={f.contactNumber} onChange={set("contactNumber")} /></Field>
        <div className="sm:col-span-2">
          <Field label="Reason for using SIJIL">
            <Textarea rows={3} value={f.reason} onChange={set("reason")} placeholder="Briefly tell us how you'd like to use SIJIL." />
          </Field>
        </div>

        <div className={`sm:col-span-2 rounded-lg border p-3 text-xs ${isFreeEmail(f.workEmail) ? "border-warning/40 bg-warning/10 text-foreground" : "border-info/30 bg-info/5 text-muted-foreground"}`}>
          {isFreeEmail(f.workEmail)
            ? <>You're using a personal email. Your account will be created as <span className="font-medium">Limited Recruiter</span>. Switch to a company email and verify it to unlock <span className="font-medium">Work Email Verified</span>.</>
            : <>Your account will start as <span className="font-medium text-foreground">Email Verification Pending</span>. After you confirm your work email it becomes <span className="font-medium text-foreground">Work Email Verified</span>.</>}
        </div>

        <div className="sm:col-span-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          {DECENTRALIZED_NOTE}
        </div>

        <div className="sm:col-span-2 mt-2">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating account…" : "Create Recruiter account"}
          </Button>
        </div>
      </form>
    </SignupShell>
  );
}

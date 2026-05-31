import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SignupShell, Field } from "./_shell";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import {
  isPersonalEmail, emailDomain, DECENTRALIZED_NOTE,
} from "@/lib/email-rules";

const Schema = z.object({
  institutionName: z.string().trim().min(1, "Required").max(200),
  officialEmail: z.string().trim().email("Invalid email").max(255),
  contactPersonName: z.string().trim().min(1, "Required").max(120),
  contactPersonRole: z.string().trim().min(1, "Required").max(120),
  department: z.string().trim().min(1, "Required").max(120),
  website: z.string().trim().url("Invalid URL").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

export default function InstitutionSignup() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [busy, setBusy] = useState(false);
  const [trustedDomains, setTrustedDomains] = useState<string[]>([]);
  const [f, setF] = useState({
    institutionName: "", officialEmail: "", contactPersonName: "",
    contactPersonRole: "", department: "", website: "",
    password: "", confirm: "",
  });

  useEffect(() => {
    supabase.from("trusted_institution_domains").select("domain").then(({ data }) => {
      setTrustedDomains((data ?? []).map((d) => d.domain));
    });
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const dom = emailDomain(f.officialEmail);
  const personal = f.officialEmail && isPersonalEmail(f.officialEmail);
  const trusted = dom && trustedDomains.includes(dom);

  const emailHint = useMemo(() => {
    if (!f.officialEmail) return "Use an official institution email (e.g. name@cust.edu.pk).";
    if (personal) return "Personal emails (Gmail, Yahoo, Outlook, etc.) are not allowed for institution signup.";
    if (trusted) return "Trusted institution domain — verification will complete automatically after email confirmation.";
    return "Domain not in trusted list yet. Account will be created with status “Verification Needs Review”.";
  }, [f.officialEmail, personal, trusted]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Schema.safeParse(f);
    if (!parsed.success) {
      toast({ title: "Please check the form", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    if (isPersonalEmail(f.officialEmail)) {
      toast({
        title: "Official institution email required",
        description: "Personal email providers are not accepted. Please use your institution domain email.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: f.officialEmail,
        password: f.password,
        options: { emailRedirectTo: `${window.location.origin}/institution/dashboard` },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("user_roles").insert({ user_id: uid, role: "institution" });
        const initialStatus = trusted ? "email_pending" : "needs_review";
        await supabase.from("institution_profiles").insert({
          user_id: uid,
          institution_name: f.institutionName,
          official_email: f.officialEmail,
          contact_email: f.officialEmail,
          contact_person_name: f.contactPersonName,
          contact_person_role: f.contactPersonRole,
          department: f.department,
          website: f.website,
          domain: dom,
          status: initialStatus,
        });
        await refreshRoles();
      }
      toast({
        title: trusted ? "Institution account created" : "Account created — verification needs review",
        description: trusted
          ? "Check your inbox to verify your institution email."
          : "Your institution domain is not recognized yet. We'll review your verification request shortly.",
      });
      navigate("/institution/dashboard", { replace: true });
    } catch (err) {
      toast({ title: "Signup failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignupShell
      title="Register your Institution"
      subtitle="Institutions verify with an official domain email — no central admin approval required."
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Institution name" required>
            <Input value={f.institutionName} onChange={set("institutionName")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Official institution email"
            required
            hint={emailHint}
          >
            <Input type="email" value={f.officialEmail} onChange={set("officialEmail")} placeholder="name@cust.edu.pk" />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {personal && (
              <StatusBadge variant="destructive" icon={<AlertTriangle className="h-3 w-3" />}>
                Personal email — not allowed
              </StatusBadge>
            )}
            {trusted && (
              <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                Trusted institution domain
              </StatusBadge>
            )}
            {f.officialEmail && !personal && !trusted && (
              <StatusBadge variant="warning">Verification Needs Review</StatusBadge>
            )}
          </div>
        </div>
        <Field label="Contact person name" required>
          <Input value={f.contactPersonName} onChange={set("contactPersonName")} />
        </Field>
        <Field label="Contact person role" required>
          <Input value={f.contactPersonRole} onChange={set("contactPersonRole")} placeholder="Registrar, Dean, IT Head…" />
        </Field>
        <Field label="Department / Office" required>
          <Input value={f.department} onChange={set("department")} />
        </Field>
        <Field label="Institution website" required>
          <Input value={f.website} onChange={set("website")} placeholder="https://institution.edu" />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={f.password} onChange={set("password")} placeholder="At least 8 characters" />
        </Field>
        <Field label="Confirm password" required>
          <Input type="password" value={f.confirm} onChange={set("confirm")} />
        </Field>

        <div className="sm:col-span-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          {DECENTRALIZED_NOTE}
        </div>

        <div className="sm:col-span-2 mt-2">
          <Button type="submit" disabled={busy || personal} className="w-full">
            {busy ? "Creating account…" : "Create Institution account"}
          </Button>
        </div>
      </form>
    </SignupShell>
  );
}

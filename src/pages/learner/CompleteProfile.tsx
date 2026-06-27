import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  User, GraduationCap, Link2, Sparkles, ChevronRight, UploadCloud, X, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Field } from "@/components/sijil/Field";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import {
  fetchLearnerProfileRow,
  isLearnerProfileComplete,
  saveLearnerOnboarding,
  saveLearnerProfileProgress,
  uploadLearnerAvatar,
  rowToOnboardingForm,
  type LearnerOnboardingData,
} from "@/lib/db/learner-profile";
import { formatSupabaseError } from "@/lib/utils";

const optUrl = z.string().trim().url("Invalid URL").optional().or(z.literal(""));

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  institutionName: z.string().trim().min(1, "Institution is required").max(200),
  program: z.string().trim().min(1, "Program is required").max(200),
  studentId: z.string().trim().min(1, "Registration number is required").max(80),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  contactNumber: z.string().trim().min(1, "Phone number is required").max(40),
  cityCountry: z.string().trim().min(1, "City / country is required").max(120),
  batch: z.string().trim().max(40).optional().or(z.literal("")),
  githubUrl: z.string().trim().url("Valid GitHub URL required"),
  linkedinUrl: z.string().trim().url("Valid LinkedIn URL required"),
  portfolioUrl: optUrl,
  bio: z.string().trim().min(1, "Short bio is required").max(2000),
  skillsSummary: z.string().trim().min(1, "Academic interests / skills summary is required").max(2000),
  careerGoal: z.string().trim().min(1, "Career goal is required").max(1000),
});

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isProvisioned, setIsProvisioned] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [formReady, setFormReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    firstName: "", lastName: "", universityEmail: "", institutionName: "", program: "", studentId: "",
    department: "", contactNumber: "", cityCountry: "", batch: "",
    githubUrl: "", linkedinUrl: "", portfolioUrl: "",
    bio: "", skillsSummary: "", careerGoal: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login/learner", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      const row = await fetchLearnerProfileRow(user.id);
      if (cancelled) return;

      if (!row?.institution_id) {
        navigate("/login/learner", { replace: true });
        return;
      }
      if (!row.account_activated_at) {
        navigate("/login/learner", { replace: true });
        return;
      }

      setIsProvisioned(true);
      setF(rowToOnboardingForm(row, user.email));
      setFormReady(true);

      setChecking(false);

      const complete = await isLearnerProfileComplete(user.id);
      if (cancelled) return;
      if (complete) {
        navigate("/learner/profile", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  useEffect(() => {
    setFormReady(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !formReady) return;

    const timer = window.setTimeout(() => {
      void saveLearnerProfileProgress(user.id, {
        firstName: f.firstName,
        lastName: f.lastName,
        contactNumber: f.contactNumber,
        cityCountry: f.cityCountry,
        githubUrl: f.githubUrl,
        linkedinUrl: f.linkedinUrl,
        portfolioUrl: f.portfolioUrl || undefined,
        bio: f.bio,
        skillsSummary: f.skillsSummary,
        careerGoal: f.careerGoal,
      }).catch(() => {
        // Silent debounced save — explicit submit still surfaces errors.
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [f, user, formReady]);

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsed = Schema.safeParse(f);
    if (!parsed.success) {
      toast({
        title: "Please complete required fields",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        avatarUrl = await uploadLearnerAvatar(user.id, avatarFile);
      }

      const data: LearnerOnboardingData = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        institutionName: f.institutionName.trim(),
        program: f.program.trim(),
        studentId: f.studentId.trim(),
        department: f.department.trim() || undefined,
        contactNumber: f.contactNumber.trim(),
        cityCountry: f.cityCountry.trim(),
        batch: f.batch.trim() || undefined,
        githubUrl: f.githubUrl.trim(),
        linkedinUrl: f.linkedinUrl.trim(),
        portfolioUrl: f.portfolioUrl.trim() || undefined,
        bio: f.bio.trim(),
        skillsSummary: f.skillsSummary.trim(),
        careerGoal: f.careerGoal.trim(),
        avatarUrl,
      };

      const updated = await saveLearnerOnboarding(user.id, data);
      setF(rowToOnboardingForm(updated, user.email));
      setAvatarFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Profile complete!", description: "Welcome to your SIJIL dashboard." });
      navigate("/learner/profile", { replace: true });
    } catch (err) {
      toast({ title: "Could not save profile", description: formatSupabaseError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="text-center">
          <div className="animate-pulse text-foreground font-medium mb-1">SIJIL</div>
          <div className="text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  const readOnlyClass = "bg-muted/50 cursor-not-allowed";

  if (!isProvisioned && !checking) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground mb-6">
          Finish your compulsory learner profile before accessing the dashboard.
        </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
          Verified Student
        </StatusBadge>
        <span className="text-xs text-muted-foreground">
          University details are verified by your institution and cannot be changed.
        </span>
      </div>

      <form onSubmit={finish} className="space-y-6">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="h-4 w-4 text-primary" /> Personal details
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <Input value={f.firstName} onChange={set("firstName")} placeholder="Ali" />
            </Field>
            <Field label="Last name" required>
              <Input value={f.lastName} onChange={set("lastName")} placeholder="Khan" />
            </Field>
            <Field label="Phone number" required>
              <Input value={f.contactNumber} onChange={set("contactNumber")} placeholder="+92 300 1234567" />
            </Field>
            <Field label="City / country" required>
              <Input value={f.cityCountry} onChange={set("cityCountry")} placeholder="Islamabad, Pakistan" />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <GraduationCap className="h-4 w-4 text-primary" /> University details
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="University email" required>
                <Input value={f.universityEmail} readOnly className={readOnlyClass} />
              </Field>
            </div>
            <Field label="University / institution" required>
              <Input value={f.institutionName} readOnly className={readOnlyClass} />
            </Field>
            <Field label="Registration number" required>
              <Input value={f.studentId} readOnly className={readOnlyClass} />
            </Field>
            <Field label="Department" required>
              <Input value={f.department} readOnly className={readOnlyClass} />
            </Field>
            <Field label="Program" required>
              <Input value={f.program} readOnly className={readOnlyClass} />
            </Field>
            <Field label="Batch / semester">
              <Input value={f.batch} readOnly className={readOnlyClass} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-primary" /> Professional links
          </div>
          <div className="grid gap-4">
            <Field label="GitHub profile URL" required>
              <Input value={f.githubUrl} onChange={set("githubUrl")} placeholder="https://github.com/yourname" />
            </Field>
            <Field label="LinkedIn profile URL" required>
              <Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/yourname" />
            </Field>
            <Field label="Portfolio website" hint="Optional">
              <Input value={f.portfolioUrl} onChange={set("portfolioUrl")} placeholder="https://yourportfolio.com" />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> About you
          </div>
          <Field label="Short bio" required>
            <Textarea value={f.bio} onChange={set("bio")} rows={3} className="resize-none" />
          </Field>
          <Field label="Academic interests / skills summary" required>
            <Textarea value={f.skillsSummary} onChange={set("skillsSummary")} rows={3} className="resize-none" />
          </Field>
          <Field label="Career goal" required>
            <Textarea value={f.careerGoal} onChange={set("careerGoal")} rows={2} className="resize-none" />
          </Field>
        </section>

        <section className="space-y-2">
          <Field label="Profile picture" hint="Optional">
            {avatarFile ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex-1 truncate">{avatarFile.name}</span>
                <button type="button" onClick={() => { setAvatarFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-md border-2 border-dashed px-4 py-5 flex flex-col items-center gap-1.5 text-sm text-muted-foreground hover:border-primary/50"
              >
                <UploadCloud className="h-6 w-6" />
                Upload profile picture
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </section>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : <>Complete profile <ChevronRight className="ml-1 h-4 w-4 inline" /></>}
        </Button>
      </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  User, GraduationCap, Link2, Sparkles, ChevronRight, ChevronLeft, Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Field, SignupShell } from "../signup/_shell";
import {
  isLearnerProfileComplete,
  saveLearnerOnboarding,
  type LearnerOnboardingData,
} from "@/lib/db/learner-profile";
import { formatSupabaseError } from "@/lib/utils";

const optUrl = z.string().trim().url("Invalid URL").optional().or(z.literal(""));

const Step1Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  institutionName: z.string().trim().min(1, "University / institution is required").max(200),
  program: z.string().trim().min(1, "Program is required").max(200),
  studentId: z.string().trim().min(1, "Student ID is required").max(80),
  contactNumber: z.string().trim().max(40).optional().or(z.literal("")),
  batch: z.string().trim().max(40).optional().or(z.literal("")),
});

const Step2Schema = z.object({
  githubUrl: optUrl,
  linkedinUrl: optUrl,
  portfolioUrl: optUrl,
});

const STEPS = [
  { id: 1, title: "Your details", icon: User, desc: "Tell us who you are" },
  { id: 2, title: "Professional links", icon: Link2, desc: "Connect your accounts" },
  { id: 3, title: "About you", icon: Sparkles, desc: "Share your story" },
] as const;

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const [f, setF] = useState({
    firstName: "", lastName: "", institutionName: "", program: "", studentId: "",
    contactNumber: "", batch: "",
    githubUrl: "", linkedinUrl: "", portfolioUrl: "",
    bio: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    isLearnerProfileComplete(user.id).then((done) => {
      if (done) navigate("/learner/profile", { replace: true });
      else setChecking(false);
    });
  }, [user, authLoading, navigate]);

  const progress = ((step - 1) / STEPS.length) * 100 + (100 / STEPS.length);

  const nextFromStep1 = () => {
    const parsed = Step1Schema.safeParse(f);
    if (!parsed.success) {
      toast({ title: "Please fill required fields", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const nextFromStep2 = () => {
    const parsed = Step2Schema.safeParse(f);
    if (!parsed.success) {
      toast({ title: "Invalid URL", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setStep(3);
  };

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const data: LearnerOnboardingData = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        institutionName: f.institutionName.trim(),
        program: f.program.trim(),
        studentId: f.studentId.trim(),
        contactNumber: f.contactNumber.trim() || undefined,
        batch: f.batch.trim() || undefined,
        githubUrl: f.githubUrl.trim() || undefined,
        linkedinUrl: f.linkedinUrl.trim() || undefined,
        portfolioUrl: f.portfolioUrl.trim() || undefined,
        bio: f.bio.trim() || undefined,
      };
      await saveLearnerOnboarding(user.id, data);
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

  return (
    <SignupShell
      title="Complete your profile"
      subtitle="A few quick steps to set up your learner account."
      backTo="/login"
      maxWidth="max-w-2xl"
    >
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {step} of {STEPS.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} className="h-2" />

        <div className="mt-6 grid grid-cols-3 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = s.id < step;
            return (
              <div
                key={s.id}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  active ? "border-primary bg-primary/5" : done ? "border-success/40 bg-success/5" : "border-border/60 bg-muted/30"
                }`}
              >
                <div className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full ${
                  active ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="text-xs font-medium">{s.title}</div>
                <div className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GraduationCap className="h-4 w-4 text-primary" />
            Personal & academic details
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required><Input value={f.firstName} onChange={set("firstName")} placeholder="Ali" /></Field>
            <Field label="Last name" required><Input value={f.lastName} onChange={set("lastName")} placeholder="Khan" /></Field>
            <Field label="University / Institution" required><Input value={f.institutionName} onChange={set("institutionName")} placeholder="CUST" /></Field>
            <Field label="Program / Department" required><Input value={f.program} onChange={set("program")} placeholder="Computer Science" /></Field>
            <Field label="Student ID / Roll number" required><Input value={f.studentId} onChange={set("studentId")} placeholder="FA21-BCS-001" /></Field>
            <Field label="Batch / Year" hint="Optional"><Input value={f.batch} onChange={set("batch")} placeholder="2021–2025" /></Field>
            <Field label="Contact number" hint="Optional"><Input value={f.contactNumber} onChange={set("contactNumber")} placeholder="+92 300 1234567" /></Field>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={nextFromStep1}>
              Continue <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link2 className="h-4 w-4 text-primary" />
            Professional accounts
          </div>
          <p className="text-sm text-muted-foreground">
            Link your professional profiles so SIJIL can verify your skills. All fields are optional — you can skip and add them later.
          </p>
          <div className="grid gap-4">
            <Field label="GitHub profile URL"><Input value={f.githubUrl} onChange={set("githubUrl")} placeholder="https://github.com/yourname" /></Field>
            <Field label="LinkedIn profile URL"><Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/yourname" /></Field>
            <Field label="Portfolio / personal website"><Input value={f.portfolioUrl} onChange={set("portfolioUrl")} placeholder="https://yourportfolio.com" /></Field>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={nextFromStep2}>
              Continue <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Tell us about yourself
          </div>
          <p className="text-sm text-muted-foreground">
            Write a short bio about your interests, skills, or career goals. This is optional.
          </p>
          <Field label="About you" hint="Optional — visible on your credential profile">
            <Textarea
              value={f.bio}
              onChange={set("bio")}
              rows={5}
              placeholder="I'm a CS student passionate about web development and open source…"
              className="resize-none"
            />
          </Field>
          <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
            You're almost done! After finishing, you'll access your full learner dashboard with skills, credentials, and integrations.
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Done — go to dashboard"}
            </Button>
          </div>
        </div>
      )}
    </SignupShell>
  );
}

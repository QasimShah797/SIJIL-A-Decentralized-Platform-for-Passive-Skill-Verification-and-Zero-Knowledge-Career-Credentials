import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  User,
  GraduationCap,
  Link2,
  Sparkles,
  ChevronRight,
  UploadCloud,
  X,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Field } from "@/components/sijil/Field";
import {
  areSelfSignupProfileColumnsAvailable,
  fetchLearnerProfileRow,
  isLearnerProfileComplete,
  rowToSelfSignupForm,
  saveSelfSignupOnboarding,
  saveSelfSignupProfileProgress,
  selfSignupProfileProgress,
  uploadLearnerAvatar,
  type LearnerSelfSignupOnboardingData,
  type SelfSignupProfileForm,
} from "@/lib/db/learner-profile";
import { formatSupabaseError } from "@/lib/utils";

const optUrl = z.string().trim().url("Invalid URL").optional().or(z.literal(""));

function buildSchema(extendedColumns: boolean) {
  return z.object({
    contactNumber: z.string().trim().min(1, "Phone number is required").max(40),
    dateOfBirth: extendedColumns
      ? z.string().trim().min(1, "Date of birth is required")
      : z.string().trim().optional().or(z.literal("")),
    gender: extendedColumns
      ? z.string().trim().min(1, "Please select your gender")
      : z.string().trim().optional().or(z.literal("")),
    country: z.string().trim().min(1, "Country is required").max(80),
    city: z.string().trim().min(1, "City is required").max(80),
    institutionName: z.string().trim().max(200).optional().or(z.literal("")),
    program: z.string().trim().max(200).optional().or(z.literal("")),
    graduationYear: z.string().trim().optional().or(z.literal("")),
    githubUrl: z.string().trim().url("Valid GitHub URL required"),
    linkedinUrl: z.string().trim().url("Valid LinkedIn URL required"),
    portfolioUrl: optUrl,
    bio: z.string().trim().min(1, "Bio is required").max(2000),
    skillsSummary: z.string().trim().min(1, "Skills summary is required").max(2000),
    careerGoal: z.string().trim().min(1, "Career goal is required").max(1000),
  });
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

const emptyForm = (): SelfSignupProfileForm => ({
  contactNumber: "",
  dateOfBirth: "",
  gender: "",
  country: "",
  city: "",
  institutionName: "",
  program: "",
  graduationYear: "",
  githubUrl: "",
  linkedinUrl: "",
  portfolioUrl: "",
  bio: "",
  skillsSummary: "",
  careerGoal: "",
});

export default function SelfSignupCompleteProfile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [formReady, setFormReady] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null);
  const [extendedColumns, setExtendedColumns] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<SelfSignupProfileForm>(emptyForm());

  const set =
    (k: keyof SelfSignupProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login/learner", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const row = await fetchLearnerProfileRow(user.id);
        if (cancelled) return;

        if (!row || row.institution_id) {
          navigate("/login/learner", { replace: true });
          return;
        }

        setExtendedColumns(areSelfSignupProfileColumnsAvailable());
        setF(rowToSelfSignupForm(row));
        setExistingAvatarUrl(row.avatar_url ?? null);
        setFormReady(true);
        setChecking(false);

        const complete = await isLearnerProfileComplete(user.id);
        if (cancelled) return;
        if (complete) {
          navigate("/learner/profile", { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        toast({
          title: "Could not load profile",
          description: formatSupabaseError(err),
          variant: "destructive",
        });
        setChecking(false);
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
      const gradYear = f.graduationYear.trim();
      void saveSelfSignupProfileProgress(user.id, {
        contactNumber: f.contactNumber,
        dateOfBirth: f.dateOfBirth || undefined,
        gender: f.gender,
        country: f.country,
        city: f.city,
        institutionName: f.institutionName || undefined,
        program: f.program || undefined,
        graduationYear: gradYear ? Number.parseInt(gradYear, 10) : undefined,
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

  const progress = selfSignupProfileProgress(f);

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsed = buildSchema(extendedColumns).safeParse(f);
    if (!parsed.success) {
      toast({
        title: "Please complete required fields",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    const gradYearStr = parsed.data.graduationYear?.trim();
    if (gradYearStr) {
      const year = Number.parseInt(gradYearStr, 10);
      if (Number.isNaN(year) || year < 1950 || year > 2100) {
        toast({
          title: "Invalid graduation year",
          description: "Please enter a valid year between 1950 and 2100.",
          variant: "destructive",
        });
        return;
      }
    }

    setBusy(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        avatarUrl = await uploadLearnerAvatar(user.id, avatarFile);
      } else if (existingAvatarUrl) {
        avatarUrl = existingAvatarUrl;
      }

      const gradYear = gradYearStr ? Number.parseInt(gradYearStr, 10) : undefined;

      const data: LearnerSelfSignupOnboardingData = {
        contactNumber: parsed.data.contactNumber.trim(),
        dateOfBirth: parsed.data.dateOfBirth || "",
        gender: parsed.data.gender || "",
        country: parsed.data.country.trim(),
        city: parsed.data.city.trim(),
        institutionName: parsed.data.institutionName?.trim() || undefined,
        program: parsed.data.program?.trim() || undefined,
        graduationYear: gradYear,
        githubUrl: parsed.data.githubUrl.trim(),
        linkedinUrl: parsed.data.linkedinUrl.trim(),
        portfolioUrl: parsed.data.portfolioUrl?.trim() || undefined,
        bio: parsed.data.bio.trim(),
        skillsSummary: parsed.data.skillsSummary.trim(),
        careerGoal: parsed.data.careerGoal.trim(),
        avatarUrl,
      };

      const updated = await saveSelfSignupOnboarding(user.id, data);
      setF(rowToSelfSignupForm(updated));
      setExistingAvatarUrl(updated.avatar_url ?? null);
      setAvatarFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Profile complete!", description: "Welcome to your SIJIL dashboard." });
      navigate("/learner/profile", { replace: true });
    } catch (err) {
      toast({
        title: "Could not save profile",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground mb-6">
          Finish your professional learner profile before accessing the dashboard.
        </p>

        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Profile progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <form onSubmit={finish} className="space-y-6">
          <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-primary" /> Personal details
            </div>

            <Field label="Profile picture" hint="Optional">
              {avatarFile ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{avatarFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ) : existingAvatarUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={existingAvatarUrl}
                    alt="Profile"
                    className="h-14 w-14 rounded-full object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-sm text-primary hover:underline"
                  >
                    Change photo
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number" required>
                <Input
                  value={f.contactNumber}
                  onChange={set("contactNumber")}
                  placeholder="+92 300 1234567"
                />
              </Field>
              <Field label="Date of birth" required>
                <Input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} />
              </Field>
              <Field label="Gender" required>
                <Select value={f.gender || undefined} onValueChange={(v) => setF((p) => ({ ...p, gender: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" required>
                <Input value={f.country} onChange={set("country")} placeholder="Pakistan" />
              </Field>
              <Field label="City" required>
                <Input value={f.city} onChange={set("city")} placeholder="Islamabad" />
              </Field>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GraduationCap className="h-4 w-4 text-primary" /> Education{" "}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current institution">
                <Input
                  value={f.institutionName}
                  onChange={set("institutionName")}
                  placeholder="University or school"
                />
              </Field>
              <Field label="Program / degree">
                <Input value={f.program} onChange={set("program")} placeholder="BSc Computer Science" />
              </Field>
              <Field label="Graduation year">
                <Input
                  type="number"
                  value={f.graduationYear}
                  onChange={set("graduationYear")}
                  placeholder="2026"
                  min={1950}
                  max={2100}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4 text-primary" /> Professional links
            </div>
            <div className="grid gap-4">
              <Field label="GitHub profile URL" required>
                <Input
                  value={f.githubUrl}
                  onChange={set("githubUrl")}
                  placeholder="https://github.com/yourname"
                />
              </Field>
              <Field label="LinkedIn profile URL" required>
                <Input
                  value={f.linkedinUrl}
                  onChange={set("linkedinUrl")}
                  placeholder="https://linkedin.com/in/yourname"
                />
              </Field>
              <Field label="Portfolio website" hint="Optional">
                <Input
                  value={f.portfolioUrl}
                  onChange={set("portfolioUrl")}
                  placeholder="https://yourportfolio.com"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> About you
            </div>
            <Field label="Bio / about me" required>
              <Textarea value={f.bio} onChange={set("bio")} rows={3} className="resize-none" />
            </Field>
            <Field label="Skills summary" required>
              <Textarea value={f.skillsSummary} onChange={set("skillsSummary")} rows={3} className="resize-none" />
            </Field>
            <Field label="Career goal" required>
              <Textarea value={f.careerGoal} onChange={set("careerGoal")} rows={2} className="resize-none" />
            </Field>
          </section>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
            Your progress is saved automatically. You can return anytime to finish your profile.
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Saving…" : <>Complete profile <ChevronRight className="ml-1 h-4 w-4 inline" /></>}
          </Button>
        </form>
      </div>
    </div>
  );
}

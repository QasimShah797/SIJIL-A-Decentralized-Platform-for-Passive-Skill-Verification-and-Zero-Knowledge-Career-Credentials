import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import {
  User,
  GraduationCap,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Image,
  Info,
  MapPin,
  Phone,
  School,
  UserRoundCheck,
  X,
} from "lucide-react";
import { PakistanCitySelect } from "@/components/profile/PakistanCitySelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { VerifiedProfessionalAccounts } from "@/components/profile/VerifiedProfessionalAccounts";
import {
  fetchLearnerProfileRow,
  type LearnerProfileRow,
  normalizeLearnerGender,
  isValidGraduationYear,
  rowToSelfSignupForm,
  saveSelfSignupOnboarding,
  saveSelfSignupProfileProgress,
  selfSignupProfileProgress,
  uploadLearnerAvatar,
  type LearnerSelfSignupOnboardingData,
  type SelfSignupProfileForm,
} from "@/lib/db/learner-profile";
import {
  clearProfileFormDraft,
  accessProfileAvatarDraft,
  loadProfileFormDraft,
  saveProfileFormDraft,
} from "@/lib/profile-oauth-draft";
import { meetsOAuthCompletionRequirements } from "@/lib/profile-oauth-verification";
import {
  isOptionalLinkedInProfileUrlValid,
  LINKEDIN_PROFILE_URL_ERROR,
  validateOptionalLinkedInProfileUrl,
} from "@/lib/linkedin-profile-url";
import { formatSupabaseError } from "@/lib/utils";
import "./SelfSignupCompleteProfile.css";

const profileSchema = z.object({
  contactNumber: z.string().trim().min(1, "Phone number is required").max(40),
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
  gender: z.enum(["", "male", "female"], { message: "Select Male or Female." }),
  country: z.string().trim().min(1, "Country is required").max(80),
  city: z.string().trim().min(1, "City is required").max(80),
  institutionName: z.string().trim().min(1, "Current institution is required").max(200),
  program: z.string().trim().min(1, "Program or degree is required").max(200),
  graduationYear: z.string().trim().regex(/^\d{4}$/, "Enter a four-digit graduation year")
    .refine(isValidGraduationYear, "Graduation year must be between 1950 and 2100"),
  bio: z.string().trim().max(2000),
  skillsSummary: z.string().trim().max(2000),
  careerGoal: z.string().trim().max(1000),
  linkedinUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => isOptionalLinkedInProfileUrlValid(val ?? ""), {
      message: LINKEDIN_PROFILE_URL_ERROR,
    }),
});

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const emptyForm = (): SelfSignupProfileForm => ({
  contactNumber: "",
  dateOfBirth: "",
  gender: "",
  country: "Pakistan",
  city: "",
  institutionName: "",
  program: "",
  graduationYear: "",
  bio: "",
  skillsSummary: "",
  careerGoal: "",
  linkedinUrl: "",
});

const RETURN_PATH = "/learner/complete-profile";

export default function SelfSignupCompleteProfile({ initialRow }: { initialRow?: LearnerProfileRow }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [formReady, setFormReady] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null);
  const [githubVerified, setGithubVerified] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<SelfSignupProfileForm>(emptyForm());

  const set =
    (k: keyof SelfSignupProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  const updateAvatar = (file: File | null) => {
    setAvatarFile(file);
    if (user) void accessProfileAvatarDraft(user.id, file);
  };

  const persistDraft = async () => {
    if (!user) return;
    saveProfileFormDraft(user.id, "self_signup", f);
    await accessProfileAvatarDraft(user.id, avatarFile);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login/learner", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const row = initialRow ?? await fetchLearnerProfileRow(user.id);
        if (cancelled) return;

        if (!row) {
          navigate("/login/learner", { replace: true });
          return;
        }

        if (row.profile_completed) {
          clearProfileFormDraft(user.id, "self_signup");
          void accessProfileAvatarDraft(user.id, null);
          navigate("/learner/profile", { replace: true });
          return;
        }

        const draft = loadProfileFormDraft<SelfSignupProfileForm>(user.id, "self_signup");
        const initial = draft ?? rowToSelfSignupForm(row, user.id);
        setF({ ...initial, country: initial.country || "Pakistan", gender: normalizeLearnerGender(initial.gender) });
        setExistingAvatarUrl(row.avatar_url ?? null);
        const draftAvatar = await accessProfileAvatarDraft(user.id);
        if (cancelled) return;
        setAvatarFile(draftAvatar);
        setFormReady(true);
        setChecking(false);

        const oauth = await meetsOAuthCompletionRequirements(user.id);
        if (cancelled) return;
        setGithubVerified(oauth.github);
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
  }, [user, authLoading, navigate, initialRow]);

  useEffect(() => {
    const github = searchParams.get("github");
    if (!github) return;

    const next = new URLSearchParams(searchParams);
    next.delete("github");
    next.delete("code");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user || !formReady || busy) return;

    saveProfileFormDraft(user.id, "self_signup", f);

    const timer = window.setTimeout(() => {
      const gradYear = f.graduationYear.trim();
      let linkedinUrl: string | null | undefined;
      if (f.linkedinUrl.trim()) {
        if (!isOptionalLinkedInProfileUrlValid(f.linkedinUrl)) {
          linkedinUrl = undefined;
        } else {
          try {
            linkedinUrl = validateOptionalLinkedInProfileUrl(f.linkedinUrl);
          } catch {
            linkedinUrl = undefined;
          }
        }
      } else {
        linkedinUrl = null;
      }

      void saveSelfSignupProfileProgress(user.id, {
        contactNumber: f.contactNumber,
        dateOfBirth: f.dateOfBirth,
        gender: f.gender,
        country: f.country,
        city: f.city,
        institutionName: f.institutionName,
        program: f.program,
        graduationYear: isValidGraduationYear(gradYear) ? Number(gradYear) : undefined,
        bio: f.bio,
        skillsSummary: f.skillsSummary,
        careerGoal: f.careerGoal,
        ...(linkedinUrl !== undefined ? { linkedinUrl } : {}),
      }).catch(() => {
        // Silent debounced save — explicit submit still surfaces errors.
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [f, user, formReady, busy]);

  const progress = selfSignupProfileProgress(f, {
    githubVerified,
  });

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;

    const parsed = profileSchema.safeParse(f);
    if (!parsed.success) {
      toast({
        title: "Please complete required fields",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    if (!githubVerified) {
      toast({
        title: "GitHub verification required",
        description: "Connect and verify your GitHub account before completing your profile.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        avatarUrl = await uploadLearnerAvatar(user.id, avatarFile);
      } else if (existingAvatarUrl) {
        avatarUrl = existingAvatarUrl;
      }

      const gradYear = Number(parsed.data.graduationYear);
      const linkedinUrl = validateOptionalLinkedInProfileUrl(parsed.data.linkedinUrl ?? "");

      const data: LearnerSelfSignupOnboardingData = {
        contactNumber: parsed.data.contactNumber.trim(),
        dateOfBirth: parsed.data.dateOfBirth || "",
        gender: parsed.data.gender || "",
        country: parsed.data.country.trim(),
        city: parsed.data.city.trim(),
        institutionName: parsed.data.institutionName?.trim() || undefined,
        program: parsed.data.program?.trim() || undefined,
        graduationYear: gradYear,
        bio: parsed.data.bio.trim(),
        skillsSummary: parsed.data.skillsSummary.trim(),
        careerGoal: parsed.data.careerGoal.trim(),
        avatarUrl,
        linkedinUrl,
      };

      const updated = await saveSelfSignupOnboarding(user.id, data);
      clearProfileFormDraft(user.id, "self_signup");
      void accessProfileAvatarDraft(user.id, null);
      setF(rowToSelfSignupForm(updated, user.id));
      setExistingAvatarUrl(updated.avatar_url ?? null);
      setAvatarFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Profile saved", description: "Next, secure your learning identity." });
      navigate("/learner/secure-identity", { replace: true });
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
      <div className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <PageSkeleton rows={5} />
        </div>
      </div>
    );
  }

  const personalComplete = [f.contactNumber, f.country, f.city].every((value) => value.trim());
  const educationComplete = Boolean(f.institutionName.trim() && f.program.trim() && isValidGraduationYear(f.graduationYear));
  const stages = [
    { id: "personal", label: "Personal" },
    { id: "education", label: "Education" },
    { id: "links", label: "Links" },
    { id: "about", label: "About" },
  ];
  const currentStage = !personalComplete ? 0 : !educationComplete ? 1 : !githubVerified ? 2 : 3;

  return (
    <main className="scp-page">
      <div className="scp-container">
        <header className="scp-header">
          <span className="scp-icon scp-header-icon"><User /></span>
          <div>
            <h1>Complete Your Profile</h1>
            <p>Finish your professional learner profile before accessing the dashboard.</p>
          </div>
          <div className="scp-header-art" aria-hidden="true">
            <ClipboardCheck className="scp-clipboard" />
            <UserRoundCheck className="scp-art-user" />
          </div>
        </header>
        <nav aria-label="Profile sections">
          <ol className="scp-steps">
            {stages.map((stage, index) => (
              <li key={stage.id}>
                <a href={stage.id === "links" ? "#profile-links" : "#" + stage.id}
                  aria-current={index === currentStage ? "step" : undefined}
                  data-reached={index <= currentStage}>
                  <span>{index + 1}</span>
                  {stage.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="scp-progress">
          <div><span>Profile progress</span><span>{progress}%</span></div>
          <progress aria-label="Profile progress" value={progress} max={100} />
        </div>
        <form onSubmit={finish} className="scp-form">
          <section className="scp-card" id="personal">
            <ProfileSectionHeading icon={User} title="Personal details" description="Basic information about you." />
            <div className="scp-personal">
              <Field label="Profile picture">
                <div className="scp-upload">
                  <button type="button" className="scp-upload-button" onClick={() => fileRef.current?.click()}>
                    {existingAvatarUrl && !avatarFile
                      ? <img src={existingAvatarUrl} alt="" className="scp-avatar" />
                      : <span className="scp-upload-icon"><Image /></span>}
                    <strong>{avatarFile?.name ?? (existingAvatarUrl ? "Change profile picture" : "Upload profile picture")}</strong>
                    <span>JPG, PNG or WebP</span>
                  </button>
                  {avatarFile && <button type="button" className="scp-remove-avatar" aria-label="Remove selected photo"
                    onClick={() => { updateAvatar(null); if (fileRef.current) fileRef.current.value = ""; }}><X /></button>}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(event) => updateAvatar(event.target.files?.[0] ?? null)} />
                </div>
              </Field>
              <div className="scp-fields">
                <Field label="Phone number" required>
                  <ProfileInputIcon icon={Phone}><Input aria-label="Phone number" aria-required="true" type="tel"
                    value={f.contactNumber} onChange={set("contactNumber")} /></ProfileInputIcon>
                </Field>
                <Field label="Date of birth">
                  <ProfileInputIcon icon={CalendarDays}><Input aria-label="Date of birth" type="date"
                    value={f.dateOfBirth} onChange={set("dateOfBirth")} /></ProfileInputIcon>
                </Field>
                <Field label="Gender">
                  <ProfileInputIcon icon={User}>
                    <Select value={f.gender || undefined} onValueChange={(value) => setF((prev) => ({ ...prev, gender: value }))}>
                      <SelectTrigger aria-label="Gender"><SelectValue /></SelectTrigger>
                      <SelectContent>{GENDER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </ProfileInputIcon>
                </Field>
                <div className="scp-field-break" />
                <Field label="Country" required>
                  <ProfileInputIcon icon={MapPin}><Input aria-label="Country" aria-required="true"
                    value={f.country} readOnly /></ProfileInputIcon>
                </Field>
                <Field label="City" required>
                  <ProfileInputIcon icon={School}>
                    <PakistanCitySelect value={f.city} onChange={(city) => setF((prev) => ({ ...prev, city, country: "Pakistan" }))} />
                  </ProfileInputIcon>
                </Field>
              </div>
            </div>
          </section>

          <section className="scp-card" id="education">
            <ProfileSectionHeading icon={GraduationCap} title="Education" description="Your current academic information." />
            <div className="scp-fields">
              <Field label="Current institution" required>
                <ProfileInputIcon icon={School}><Input aria-label="Current institution" aria-required="true"
                  value={f.institutionName} onChange={set("institutionName")} /></ProfileInputIcon>
              </Field>
              <Field label="Program / degree" required>
                <ProfileInputIcon icon={BookOpen}><Input aria-label="Program / degree" aria-required="true"
                  value={f.program} onChange={set("program")} /></ProfileInputIcon>
              </Field>
              <Field label="Graduation year" required>
                <ProfileInputIcon icon={CalendarDays}><Input aria-label="Graduation year" aria-required="true"
                  inputMode="numeric" maxLength={4} value={f.graduationYear} onChange={set("graduationYear")} /></ProfileInputIcon>
              </Field>
            </div>
          </section>

          {user && (
            <div id="profile-links">
              <VerifiedProfessionalAccounts compact userId={user.id} returnTo={RETURN_PATH} linkedinUrl={f.linkedinUrl}
                onLinkedInUrlChange={(value) => setF((prev) => ({ ...prev, linkedinUrl: value }))}
                onBeforeConnect={persistDraft} onGitHubVerifiedChange={setGithubVerified} />
            </div>
          )}

          <section className="scp-card" id="about">
            <ProfileSectionHeading icon={User} title="About you" optional description="Tell us about yourself, your skills and your goals." />
            <div className="scp-fields scp-about-fields">
              <Field label="Bio / about me">
                <Textarea aria-label="Bio / about me" value={f.bio} onChange={set("bio")} rows={3} />
              </Field>
              <Field label="Skills summary">
                <Textarea aria-label="Skills summary" value={f.skillsSummary} onChange={set("skillsSummary")} rows={3} />
              </Field>
              <Field label="Career goal">
                <Textarea aria-label="Career goal" value={f.careerGoal} onChange={set("careerGoal")} rows={3} />
              </Field>
            </div>
          </section>

          <footer className="scp-footer">
            <p><Info /> Your progress is saved automatically. Form data is preserved when you connect GitHub.</p>
            <Button type="submit" disabled={busy} className="scp-submit">
              {busy ? "Saving..." : <>Complete profile <ArrowRight /></>}
            </Button>
          </footer>
        </form>
      </div>
    </main>
  );
}

function ProfileSectionHeading({ icon: Icon, title, description, optional }: {
  icon: typeof User;
  title: string;
  description: string;
  optional?: boolean;
}) {
  return (
    <div className="scp-card-heading">
      <span className="scp-icon"><Icon /></span>
      <div>
        <h2>{title}{optional && <small> (optional)</small>}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ProfileInputIcon({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return <div className="scp-input-icon"><Icon aria-hidden="true" />{children}</div>;
}

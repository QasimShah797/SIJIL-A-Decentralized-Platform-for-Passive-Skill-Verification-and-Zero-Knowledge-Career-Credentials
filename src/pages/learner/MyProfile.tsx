import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  User,
  GraduationCap,
  Link2,
  Sparkles,
  Lock,
  Pencil,
  X,
  Copy,
  BadgeCheck,
  Phone,
  Globe,
  MapPin,
  Calendar,
  Camera,
  Mail,
} from "lucide-react";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  ProfilePageRightRail,
  formatProfileDate,
  shortDid,
} from "@/components/learner/ProfilePagePanels";
import { Field } from "@/components/sijil/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  useCredentials,
  useDeclaredSkills,
  useLearnerProfile,
  usePeerReviews,
} from "@/hooks/useLearnerData";
import {
  updateLearnerEditableProfile,
  uploadLearnerAvatar,
  type LearnerEditableProfile,
} from "@/lib/db/learner-profile";
import { VerifiedGitHubCard } from "@/components/profile/VerifiedGitHubCard";
import { LinkedInProfileUrlField } from "@/components/profile/LinkedInProfileUrlField";
import {
  isOptionalLinkedInProfileUrlValid,
  LINKEDIN_PROFILE_URL_ERROR,
  validateOptionalLinkedInProfileUrl,
} from "@/lib/linkedin-profile-url";
import { formatSupabaseError } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const baseEditSchema = {
  contactNumber: z.string().trim().min(1, "Phone number is required").max(40),
  bio: z.string().trim().min(1, "Short bio is required").max(2000),
  skillsSummary: z.string().trim().min(1, "Academic interests / skills summary is required").max(2000),
  careerGoal: z.string().trim().min(1, "Career goal is required").max(1000),
  linkedinUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => isOptionalLinkedInProfileUrlValid(val ?? ""), {
      message: LINKEDIN_PROFILE_URL_ERROR,
    }),
};

const selfSignupEditSchema = z.object({
  ...baseEditSchema,
  city: z.string().trim().min(1, "City is required").max(80),
  country: z.string().trim().min(1, "Country is required").max(80),
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
  gender: z.string().trim().optional().or(z.literal("")),
  graduationYear: z.string().trim().optional().or(z.literal("")),
  institutionName: z.string().trim().max(200).optional().or(z.literal("")),
  program: z.string().trim().max(200).optional().or(z.literal("")),
});

type SelfSignupEditForm = z.infer<typeof selfSignupEditSchema>;
type EditForm = SelfSignupEditForm;

function ProfileFieldRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#023E8A]" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-[#64748b]">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-[#334155] break-words">{value || "—"}</dd>
      </div>
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2 text-sm font-medium text-[#334155]">
        {value || "—"}
        <Lock className="h-3 w-3 text-[#94a3b8]" aria-hidden />
      </dd>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[#334155] break-words">{value || "—"}</dd>
    </div>
  );
}

function SectionEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium text-[#023E8A] hover:underline"
    >
      <Pencil className="h-3 w-3" /> Edit
    </button>
  );
}

export default function MyProfile() {
  const { user } = useAuth();
  const { profile, loading, refresh } = useLearnerProfile();
  const { skills } = useDeclaredSkills();
  const { credentials } = useCredentials();
  const { reviews } = usePeerReviews();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const [form, setForm] = useState<EditForm>({
    contactNumber: "",
    bio: "",
    skillsSummary: "",
    careerGoal: "",
    city: "",
    country: "",
    dateOfBirth: "",
    gender: "",
    graduationYear: "",
    institutionName: "",
    program: "",
    linkedinUrl: "",
  });

  useEffect(() => {
    if (!profile || editing) return;
    setForm({
      contactNumber: profile.contactNumber ?? "",
      city: profile.city ?? "",
      country: profile.country ?? "",
      bio: profile.bio ?? "",
      skillsSummary: profile.skillsSummary ?? "",
      careerGoal: profile.careerGoal ?? "",
      dateOfBirth: profile.dateOfBirth ?? "",
      gender: profile.gender ?? "",
      graduationYear: profile.graduationYear != null ? String(profile.graduationYear) : "",
      institutionName: profile.institution !== "—" ? profile.institution : "",
      program: profile.program !== "—" ? profile.program : "",
      linkedinUrl: profile.linkedinUrl ?? "",
    });
  }, [profile, editing]);

  const evidenceCount = useMemo(
    () => skills.filter((s) => s.status !== "Skill Claimed").length,
    [skills],
  );

  const skillTags = useMemo(() => {
    if (skills.length > 0) return skills.map((s) => s.name);
    return (profile?.skillsSummary ?? "")
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }, [skills, profile?.skillsSummary]);

  const copyDid = () => {
    if (!profile?.did) return;
    void navigator.clipboard.writeText(profile.did);
    toast({ title: "DID copied to clipboard" });
  };

  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const startEdit = () => {
    if (profile) {
      setForm({
        contactNumber: profile.contactNumber ?? "",
        city: profile.city ?? "",
        country: profile.country ?? "",
        bio: profile.bio ?? "",
        skillsSummary: profile.skillsSummary ?? "",
        careerGoal: profile.careerGoal ?? "",
        dateOfBirth: profile.dateOfBirth ?? "",
        gender: profile.gender ?? "",
        graduationYear: profile.graduationYear != null ? String(profile.graduationYear) : "",
        institutionName: profile.institution !== "—" ? profile.institution : "",
        program: profile.program !== "—" ? profile.program : "",
        linkedinUrl: profile.linkedinUrl ?? "",
      });
    }
    setAvatarFile(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setAvatarFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setEditing(false);
  };

  const save = async () => {
    if (!user || !profile) return;

    const parsed = selfSignupEditSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: "Please fix the form",
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

      const linkedinUrl = validateOptionalLinkedInProfileUrl(parsed.data.linkedinUrl ?? "");
      const d = parsed.data;
      const gradYearStr = d.graduationYear?.trim();
      let graduationYear: number | null | undefined;
      if (gradYearStr) {
        const year = Number.parseInt(gradYearStr, 10);
        if (Number.isNaN(year) || year < 1950 || year > 2100) {
          throw new Error("Please enter a valid graduation year.");
        }
        graduationYear = year;
      } else {
        graduationYear = null;
      }

      const payload: LearnerEditableProfile = {
        contactNumber: d.contactNumber,
        bio: d.bio,
        skillsSummary: d.skillsSummary,
        careerGoal: d.careerGoal,
        avatarUrl,
        linkedinUrl,
        city: d.city,
        country: d.country,
        dateOfBirth: d.dateOfBirth || undefined,
        gender: d.gender || undefined,
        graduationYear,
        institutionName: d.institutionName || undefined,
        program: d.program || undefined,
      };

      await updateLearnerEditableProfile(user.id, payload);
      await refresh();
      setEditing(false);
      setAvatarFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Profile updated", description: "Your changes have been saved." });
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

  if (loading || !profile) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={5} />
      </LearnerWorkspaceShell>
    );
  }

  const rightRail = <ProfilePageRightRail profile={profile} />;

  return (
    <LearnerWorkspaceShell variant="dashboard" rightRail={rightRail}>
      <div id="profile-top" className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#023E8A] sm:text-[1.65rem]">My Profile</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Manage your personal, academic and professional information.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={copyDid}
              className="mono flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs text-[#64748b] hover:text-[#023E8A]"
            >
              DID: {shortDid(profile.did)}
              <Copy className="h-3 w-3 shrink-0" />
            </button>
            {editing ? (
              <>
                <Button variant="outline" className="rounded-xl" onClick={cancelEdit} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                  onClick={() => void save()}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="learner-stat-card p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative mx-auto sm:mx-0">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt={profile.name}
                    className="h-28 w-28 rounded-full object-cover ring-4 ring-[#e8eef7]"
                  />
                ) : profile.avatarUrl ? (
                  <img
                    key={profile.avatarUrl}
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="h-28 w-28 rounded-full object-cover ring-4 ring-[#e8eef7]"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#023E8A] text-3xl font-semibold text-white ring-4 ring-[#e8eef7]">
                    {profile.avatar}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!editing) startEdit();
                    fileRef.current?.click();
                  }}
                  className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#023E8A] text-white shadow-md ring-2 ring-white"
                  aria-label="Change profile picture"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    setAvatarFile(e.target.files?.[0] ?? null);
                    if (!editing) setEditing(true);
                  }}
                />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h2 className="text-xl font-bold capitalize text-[#023E8A]">{profile.name}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#e8eef7] px-2 py-0.5 text-xs font-medium text-[#023E8A]">
                    <BadgeCheck className="h-3 w-3" />
                    Learner
                  </span>
                </div>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[#64748b] sm:justify-start">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {profile.email}
                </p>
                <button
                  type="button"
                  onClick={copyDid}
                  className="mono mt-2 flex max-w-full items-center justify-center gap-1.5 truncate text-left text-xs text-[#64748b] hover:text-[#023E8A] sm:justify-start"
                >
                  {profile.did}
                  <Copy className="h-3 w-3 shrink-0" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-4 sm:grid-cols-4 lg:border-t-0 lg:pt-0">
              {[
                { label: "Competencies", value: skills.length },
                { label: "Evidence Items", value: evidenceCount },
                { label: "Verifications", value: credentials.length },
                { label: "Peer Reviews", value: reviews.length },
              ].map(({ label, value }) => (
                <div key={label} className="text-center lg:border-l lg:border-[#e2e8f0] lg:pl-4 first:lg:border-l-0">
                  <p className="text-2xl font-bold text-[#023E8A]">{value}</p>
                  <p className="text-xs text-[#64748b]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="learner-stat-card p-6 md:col-span-2">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                <User className="h-4 w-4" />
                Personal Information
              </h3>
              <div className="flex items-center gap-2">
                {profile.institutionLinked && (
                  <span className="rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[10px] font-medium text-[#059669]">
                    Verified by Institution
                  </span>
                )}
                {!editing && <SectionEditButton onClick={startEdit} />}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <LockedField label="Full name" value={profile.name} />
              {editing ? (
                <>
                  <Field label="Phone number" required>
                    <Input value={form.contactNumber} onChange={set("contactNumber")} className="rounded-xl" />
                  </Field>
                  <Field label="Date of birth">
                    <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className="rounded-xl" />
                  </Field>
                  <Field label="Gender">
                    <Input value={form.gender} onChange={set("gender")} placeholder="e.g. Female" className="rounded-xl" />
                  </Field>
                  <Field label="Country" required>
                    <Input value={form.country} onChange={set("country")} className="rounded-xl" />
                  </Field>
                  <Field label="City" required>
                    <Input value={form.city} onChange={set("city")} className="rounded-xl" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Short bio" required>
                      <Textarea value={form.bio} onChange={set("bio")} rows={3} className="resize-none rounded-xl" />
                    </Field>
                  </div>
                  {avatarFile && (
                    <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm">
                      {avatarPreviewUrl ? (
                        <img src={avatarPreviewUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      ) : null}
                      <span className="flex-1 truncate">{avatarFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarFile(null);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                      >
                        <X className="h-4 w-4 text-[#64748b] hover:text-destructive" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ProfileFieldRow icon={Phone} label="Phone number" value={profile.contactNumber ?? ""} />
                  <ProfileFieldRow icon={Calendar} label="Date of birth" value={formatProfileDate(profile.dateOfBirth)} />
                  <ProfileFieldRow icon={User} label="Gender" value={profile.gender ?? ""} />
                  <ProfileFieldRow icon={Globe} label="Country" value={profile.country ?? ""} />
                  <ProfileFieldRow icon={MapPin} label="City" value={profile.city ?? ""} />
                  <div className="sm:col-span-2">
                    <ProfileFieldRow icon={Sparkles} label="Short bio" value={profile.bio ?? ""} />
                  </div>
                  <div className="sm:col-span-2">
                    <ProfileFieldRow icon={Globe} label="Website / Portfolio" value={profile.portfolioUrl ?? ""} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="learner-stat-card p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
              <Link2 className="h-4 w-4" />
              Professional Links
            </h3>
            <p className="mt-1 mb-5 text-xs text-[#64748b]">
              Connect your professional accounts to showcase your work and achievements.
            </p>
            {user ? (
              <div className="space-y-4">
                <VerifiedGitHubCard userId={user.id} returnTo="/learner/my-profile" required={false} />
                <LinkedInProfileUrlField
                  value={editing ? form.linkedinUrl ?? "" : profile.linkedinUrl ?? ""}
                  onChange={(value) => setForm((prev) => ({ ...prev, linkedinUrl: value }))}
                  readOnly={!editing}
                  onAddClick={startEdit}
                />
              </div>
            ) : null}
          </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="learner-stat-card min-w-0 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                <GraduationCap className="h-4 w-4" />
                Education
              </h3>
              {!editing && <SectionEditButton onClick={startEdit} />}
            </div>
            {editing ? (
              <div className="space-y-4">
                <Field label="Current institution" hint="Optional">
                  <Input value={form.institutionName} onChange={set("institutionName")} className="rounded-xl" />
                </Field>
                <Field label="Program / degree" hint="Optional">
                  <Input value={form.program} onChange={set("program")} className="rounded-xl" />
                </Field>
                <Field label="Graduation year" hint="Optional">
                  <Input
                    type="number"
                    value={form.graduationYear}
                    onChange={set("graduationYear")}
                    placeholder="2026"
                    className="rounded-xl"
                  />
                </Field>
              </div>
            ) : (
              <dl className="space-y-4">
                <ReadOnlyRow label="Current institution" value={profile.institution !== "—" ? profile.institution : ""} />
                <ReadOnlyRow label="Program / degree" value={profile.program !== "—" ? profile.program : ""} />
                <ReadOnlyRow
                  label="Graduation year"
                  value={profile.graduationYear != null ? String(profile.graduationYear) : ""}
                />
              </dl>
            )}
          </div>

            <div className="learner-stat-card min-w-0 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                <Sparkles className="h-4 w-4" />
                Career Information
              </h3>
              {!editing && <SectionEditButton onClick={startEdit} />}
            </div>
            {editing ? (
              <div className="space-y-4">
                <Field label="Academic interests / skills summary" required>
                  <Textarea value={form.skillsSummary} onChange={set("skillsSummary")} rows={3} className="resize-none rounded-xl" />
                </Field>
                <Field label="Career goal" required>
                  <Textarea value={form.careerGoal} onChange={set("careerGoal")} rows={2} className="resize-none rounded-xl" />
                </Field>
              </div>
            ) : (
              <dl className="space-y-4">
                <ReadOnlyRow label="Academic interests / skills summary" value={profile.skillsSummary ?? ""} />
                <ReadOnlyRow label="Career goal" value={profile.careerGoal ?? ""} />
              </dl>
            )}
          </div>
          </div>

          <div className="learner-stat-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#023E8A]">Skills Summary</h3>
              {!editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="flex items-center gap-1 text-xs font-medium text-[#023E8A] hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Edit Skills
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {skillTags.length > 0 ? (
                skillTags.map((tag) => (
                  <span key={tag} className="learner-skill-tag">
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-sm text-[#64748b]">No skills declared yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </LearnerWorkspaceShell>
  );
}

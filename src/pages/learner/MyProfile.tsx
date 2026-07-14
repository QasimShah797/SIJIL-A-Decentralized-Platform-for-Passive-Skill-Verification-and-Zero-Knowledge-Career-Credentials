import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  User, GraduationCap, Link2, Sparkles, Wallet, Lock, Pencil, UploadCloud, X, ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { InfoHint } from "@/components/sijil/InfoHint";
import { Field } from "@/components/sijil/Field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile } from "@/hooks/useLearnerData";
import {
  updateLearnerEditableProfile,
  uploadLearnerAvatar,
  type LearnerEditableProfile,
} from "@/lib/db/learner-profile";
import { VerifiedProfessionalAccounts } from "@/components/profile/VerifiedProfessionalAccounts";
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

const institutionEditSchema = z.object({
  ...baseEditSchema,
  cityCountry: z.string().trim().min(1, "City / country is required").max(120),
});

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

type InstitutionEditForm = z.infer<typeof institutionEditSchema>;
type SelfSignupEditForm = z.infer<typeof selfSignupEditSchema>;
type EditForm = InstitutionEditForm | SelfSignupEditForm;

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        {label}
        <span className="text-[10px] font-normal uppercase tracking-wide text-primary/80">
          Verified by institution
        </span>
      </div>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value || "—"}</dd>
    </div>
  );
}

export default function MyProfile() {
  const { user } = useAuth();
  const { profile, loading, refresh } = useLearnerProfile();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EditForm>({
    contactNumber: "",
    bio: "",
    skillsSummary: "",
    careerGoal: "",
    cityCountry: "",
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
    if (profile.institutionLinked) {
      setForm({
        contactNumber: profile.contactNumber ?? "",
        cityCountry: profile.cityCountry ?? "",
        bio: profile.bio ?? "",
        skillsSummary: profile.skillsSummary ?? "",
        careerGoal: profile.careerGoal ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
      });
    } else {
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
  }, [profile, editing]);

  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const startEdit = () => {
    if (profile) {
      if (profile.institutionLinked) {
        setForm({
          contactNumber: profile.contactNumber ?? "",
          cityCountry: profile.cityCountry ?? "",
          bio: profile.bio ?? "",
          skillsSummary: profile.skillsSummary ?? "",
          careerGoal: profile.careerGoal ?? "",
          linkedinUrl: profile.linkedinUrl ?? "",
        });
      } else {
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

    const schema = profile.institutionLinked ? institutionEditSchema : selfSignupEditSchema;
    const parsed = schema.safeParse(form);
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

      const base = {
        contactNumber: parsed.data.contactNumber,
        bio: parsed.data.bio,
        skillsSummary: parsed.data.skillsSummary,
        careerGoal: parsed.data.careerGoal,
        avatarUrl,
        linkedinUrl,
      };

      const payload: LearnerEditableProfile = profile.institutionLinked
        ? { ...base, cityCountry: (parsed.data as InstitutionEditForm).cityCountry }
        : (() => {
            const d = parsed.data as SelfSignupEditForm;
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
            return {
              ...base,
              city: d.city,
              country: d.country,
              dateOfBirth: d.dateOfBirth || undefined,
              gender: d.gender || undefined,
              graduationYear,
              institutionName: d.institutionName || undefined,
              program: d.program || undefined,
            };
          })();

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
      <AppShell role="learner">
        <div className="text-sm text-muted-foreground">Loading profile…</div>
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="My Profile"
        description={
          profile.institutionLinked
            ? "View and update your personal and professional information. University details are verified by your institution."
            : "View and update your learner-owned profile. Institution-verified fields will appear here once linked."
        }
        actions={
          editing ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : (
            <Button onClick={startEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit profile
            </Button>
          )
        }
      />

      <div className="mb-6 flex items-center gap-4 rounded-xl border bg-card p-5">
        {profile.avatarUrl && !avatarFile ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className="h-20 w-20 rounded-full object-cover border"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {profile.avatar}
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{profile.name}</h2>
            {profile.isVerifiedStudent && (
              <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                Verified Student
              </StatusBadge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {profile.institutionLinked ? profile.institution : profile.email}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Personal information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LockedField label="Full name" value={profile.name} />
            {editing ? (
              <>
                <Field label="Phone number" required>
                  <Input value={form.contactNumber} onChange={set("contactNumber")} />
                </Field>
                {profile.institutionLinked ? (
                  <Field label="City / country" required>
                    <Input value={"cityCountry" in form ? form.cityCountry : ""} onChange={set("cityCountry")} />
                  </Field>
                ) : (
                  <>
                    <Field label="Country" required>
                      <Input value={"country" in form ? form.country : ""} onChange={set("country")} />
                    </Field>
                    <Field label="City" required>
                      <Input value={"city" in form ? form.city : ""} onChange={set("city")} />
                    </Field>
                    <Field label="Date of birth">
                      <Input type="date" value={"dateOfBirth" in form ? form.dateOfBirth : ""} onChange={set("dateOfBirth")} />
                    </Field>
                    <Field label="Gender">
                      <Input value={"gender" in form ? form.gender : ""} onChange={set("gender")} placeholder="e.g. Female" />
                    </Field>
                  </>
                )}
                <div className="sm:col-span-2">
                  <Field label="Short bio" required>
                    <Textarea value={form.bio} onChange={set("bio")} rows={3} className="resize-none" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
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
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex w-full flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-4 py-5 text-sm text-muted-foreground hover:border-primary/50"
                      >
                        <UploadCloud className="h-6 w-6" />
                        Upload new profile picture
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
                </div>
              </>
            ) : (
              <>
                <ReadOnlyRow label="Phone number" value={profile.contactNumber ?? ""} />
                {profile.institutionLinked ? (
                  <ReadOnlyRow label="City / country" value={profile.cityCountry ?? ""} />
                ) : (
                  <>
                    <ReadOnlyRow label="Country" value={profile.country ?? ""} />
                    <ReadOnlyRow label="City" value={profile.city ?? ""} />
                    <ReadOnlyRow label="Date of birth" value={profile.dateOfBirth ?? ""} />
                    <ReadOnlyRow label="Gender" value={profile.gender ?? ""} />
                  </>
                )}
                <div className="sm:col-span-2">
                  <ReadOnlyRow label="Short bio" value={profile.bio ?? ""} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {profile.institutionLinked ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-primary" />
                Verified university information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <LockedField label="Institution" value={profile.institution} />
              <LockedField label="University email" value={profile.universityEmail ?? profile.email} />
              <LockedField label="Registration number" value={profile.studentId} />
              <LockedField label="Department" value={profile.department} />
              <LockedField label="Program" value={profile.program} />
              <LockedField label="Batch / semester" value={profile.batch} />
              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1.5">Status</div>
                {profile.isVerifiedStudent ? (
                  <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                    Verified Student
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="neutral">{profile.status}</StatusBadge>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-primary" />
                Education
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {editing ? (
                <>
                  <Field label="Current institution" hint="Optional">
                    <Input
                      value={"institutionName" in form ? form.institutionName : ""}
                      onChange={set("institutionName")}
                    />
                  </Field>
                  <Field label="Program / degree" hint="Optional">
                    <Input value={"program" in form ? form.program : ""} onChange={set("program")} />
                  </Field>
                  <Field label="Graduation year" hint="Optional">
                    <Input
                      type="number"
                      value={"graduationYear" in form ? form.graduationYear : ""}
                      onChange={set("graduationYear")}
                      placeholder="2026"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <ReadOnlyRow
                    label="Current institution"
                    value={profile.institution !== "—" ? profile.institution : ""}
                  />
                  <ReadOnlyRow label="Program / degree" value={profile.program !== "—" ? profile.program : ""} />
                  <ReadOnlyRow
                    label="Graduation year"
                    value={profile.graduationYear != null ? String(profile.graduationYear) : ""}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              Professional links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? (
              <VerifiedProfessionalAccounts
                userId={user.id}
                returnTo="/learner/my-profile"
                linkedinUrl={editing ? form.linkedinUrl ?? "" : profile.linkedinUrl ?? ""}
                onLinkedInUrlChange={(value) => setForm((prev) => ({ ...prev, linkedinUrl: value }))}
                linkedinReadOnly={!editing}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Career information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <Field label="Academic interests / skills summary" required>
                  <Textarea value={form.skillsSummary} onChange={set("skillsSummary")} rows={3} className="resize-none" />
                </Field>
                <Field label="Career goal" required>
                  <Textarea value={form.careerGoal} onChange={set("careerGoal")} rows={2} className="resize-none" />
                </Field>
              </>
            ) : (
              <>
                <ReadOnlyRow label="Academic interests / skills summary" value={profile.skillsSummary ?? ""} />
                <ReadOnlyRow label="Career goal" value={profile.careerGoal ?? ""} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              DID / wallet identity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">Holder DID</span>
              <span className="mono break-all font-medium">{profile.did}</span>
              <InfoHint text="Decentralized Identifier under your control. Used to bind issued credentials to you as the holder." />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

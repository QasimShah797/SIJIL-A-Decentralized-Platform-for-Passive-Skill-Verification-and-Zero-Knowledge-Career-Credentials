import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Copy,
  Globe,
  Link2,
  Lock,
  Mail,
  Pencil,
  Phone,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { Field } from "@/components/sijil/Field";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { LinkedInProfileUrlField } from "@/components/profile/LinkedInProfileUrlField";
import {
  RecruiterProfileRightRail,
  recruiterProfileCompletenessPercent,
} from "@/components/recruiter/RecruiterProfilePanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile } from "@/hooks/useLearnerData";
import { useCandidates } from "@/hooks/useCandidates";
import { RECRUITER_PROFILE_UPDATED, useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { toast } from "@/hooks/use-toast";
import { listInterviewsApi } from "@/services/api/interview.api";
import { formatProfileDate, shortDid } from "@/components/learner/ProfilePagePanels";
import {
  hiringFocusTags,
  normalizeOptionalWebsite,
  recruiterVerificationLabel,
  updateRecruiterEditableProfile,
  uploadRecruiterAvatar,
} from "@/lib/db/recruiter-profile";
import {
  isOptionalLinkedInProfileUrlValid,
  LINKEDIN_PROFILE_URL_ERROR,
  validateOptionalLinkedInProfileUrl,
} from "@/lib/linkedin-profile-url";
import { formatSupabaseError } from "@/lib/utils";

const editSchema = z.object({
  contactNumber: z.string().trim().min(1, "Phone number is required").max(40),
  jobTitle: z.string().trim().min(1, "Job title is required").max(160),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  companyWebsite: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      try {
        normalizeOptionalWebsite(value ?? "");
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid company website URL."),
  linkedinUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => isOptionalLinkedInProfileUrlValid(value ?? ""), {
      message: LINKEDIN_PROFILE_URL_ERROR,
    }),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

type EditForm = z.infer<typeof editSchema>;

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
        <dd className="mt-0.5 break-words text-sm font-medium text-[#334155]">{value || "—"}</dd>
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
      <dd className="mt-0.5 break-words text-sm font-medium text-[#334155]">{value || "—"}</dd>
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

function isUpcoming(scheduledAt: string, status: string) {
  return status === "scheduled" && new Date(scheduledAt).getTime() >= Date.now() - 60_000;
}

export default function RecruiterProfile() {
  const { user } = useAuth();
  const { profile, loading, error, refresh } = useRecruiterProfile();
  const { profile: identity } = useLearnerProfile();
  const { candidates } = useCandidates();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [interviewCount, setInterviewCount] = useState<number | null>(null);
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );

  const [form, setForm] = useState<EditForm>({
    contactNumber: "",
    jobTitle: "",
    companyName: "",
    companyWebsite: "",
    linkedinUrl: "",
    reason: "",
  });

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!profile || editing) return;
    setForm({
      contactNumber: profile.contactNumber ?? "",
      jobTitle: profile.jobTitle,
      companyName: profile.companyName,
      companyWebsite: profile.companyWebsite ?? "",
      linkedinUrl: profile.linkedinUrl ?? "",
      reason: profile.reason ?? "",
    });
  }, [profile, editing]);

  useEffect(() => {
    let active = true;
    listInterviewsApi()
      .then((rows) => {
        if (!active) return;
        setInterviewCount(rows.length);
        setUpcomingCount(rows.filter((row) => isUpcoming(row.scheduledAt, row.status)).length);
      })
      .catch(() => {
        if (!active) return;
        setInterviewCount(null);
        setUpcomingCount(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const focusTags = useMemo(
    () => (profile ? hiringFocusTags(profile.reason, profile.jobTitle) : []),
    [profile],
  );

  const set = (key: keyof EditForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const startEdit = () => {
    if (profile) {
      setForm({
        contactNumber: profile.contactNumber ?? "",
        jobTitle: profile.jobTitle,
        companyName: profile.companyName,
        companyWebsite: profile.companyWebsite ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
        reason: profile.reason ?? "",
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
    const parsed = editSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: "Please fix the form",
        description: parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) avatarUrl = await uploadRecruiterAvatar(user.id, avatarFile);
      const data = parsed.data;
      await updateRecruiterEditableProfile(user.id, {
        contactNumber: data.contactNumber,
        jobTitle: data.jobTitle,
        companyName: data.companyName,
        companyWebsite: normalizeOptionalWebsite(data.companyWebsite ?? ""),
        linkedinUrl: validateOptionalLinkedInProfileUrl(data.linkedinUrl ?? ""),
        reason: data.reason?.trim() ? data.reason.trim() : null,
        avatarUrl,
      });
      await refresh();
      window.dispatchEvent(new Event(RECRUITER_PROFILE_UPDATED));
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

  if (loading) {
    return (
      <AppShell role="recruiter">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell role="recruiter">
        <div className="mx-auto max-w-3xl py-10">
          <p className="text-lg font-semibold">Could not load profile</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "This account does not have a recruiter profile yet."}
          </p>
        </div>
      </AppShell>
    );
  }

  const completeness = recruiterProfileCompletenessPercent(profile);
  const verification = recruiterVerificationLabel(profile.verificationStatus);
  const verified = profile.verificationStatus === "verified" || profile.verificationStatus === "company_domain_verified";

  return (
    <AppShell role="recruiter" contentClassName="!max-w-none flex min-h-0 flex-col p-0">
      <div className="learner-shell-dashboard flex min-h-[calc(100vh-3.5rem)] flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 px-4 pb-6 pt-3 sm:px-6 lg:px-8 lg:pb-8 lg:pt-4">
          <div id="profile-top" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[#023E8A] sm:text-[1.65rem]">My Profile</h1>
                <p className="mt-1 text-sm text-[#64748b]">
                  Manage your personal, company, and hiring information.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative mx-auto sm:mx-0">
                    {avatarPreviewUrl || profile.avatarUrl ? (
                      <img
                        src={avatarPreviewUrl ?? profile.avatarUrl ?? undefined}
                        alt={profile.fullName}
                        className="h-28 w-28 rounded-full object-cover ring-4 ring-[#e8eef7]"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#023E8A] text-3xl font-semibold text-white ring-4 ring-[#e8eef7]">
                        {profile.initials}
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
                      onChange={(event) => {
                        setAvatarFile(event.target.files?.[0] ?? null);
                        if (!editing) setEditing(true);
                      }}
                    />
                  </div>
                  <div className="min-w-0 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <h2 className="text-xl font-bold capitalize text-[#023E8A]">{profile.fullName}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8eef7] px-2 py-0.5 text-xs font-medium text-[#023E8A]">
                        <BadgeCheck className="h-3 w-3" />
                        Recruiter
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {profile.jobTitle} · {profile.companyName}
                    </p>
                    <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[#64748b] sm:justify-start">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {profile.workEmail}
                    </p>
                    <p className="mt-2 text-xs text-[#64748b]">Member since {formatProfileDate(profile.createdAt)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 lg:items-end">
                  {identity?.did ? (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(identity.did);
                        toast({ title: "DID copied to clipboard" });
                      }}
                      className="mono flex items-center gap-1.5 self-end rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs text-[#64748b] hover:text-[#023E8A]"
                    >
                      DID: {shortDid(identity.did)}
                      <Copy className="h-3 w-3 shrink-0" />
                    </button>
                  ) : null}
                <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-4 sm:grid-cols-4 lg:border-t-0 lg:pt-0">
                  {[
                    { label: "Directory", value: String(candidates.length) },
                    { label: "Interviews", value: interviewCount == null ? "—" : String(interviewCount) },
                    { label: "Upcoming", value: upcomingCount == null ? "—" : String(upcomingCount) },
                    { label: "Profile", value: `${completeness}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center lg:border-l lg:border-[#e2e8f0] lg:pl-4 first:lg:border-l-0">
                      <p className="text-2xl font-bold text-[#023E8A]">{value}</p>
                      <p className="text-xs text-[#64748b]">{label}</p>
                    </div>
                  ))}
                </div>
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
                    <span
                      className={
                        verified
                          ? "rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[10px] font-medium text-[#059669]"
                          : "rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[10px] font-medium text-[#c2410c]"
                      }
                    >
                      {verification}
                    </span>
                    {!editing && <SectionEditButton onClick={startEdit} />}
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <LockedField label="Full name" value={profile.fullName} />
                  <LockedField label="Work email" value={profile.workEmail} />
                  {editing ? (
                    <>
                      <Field label="Phone number" required>
                        <Input value={form.contactNumber} onChange={set("contactNumber")} className="rounded-xl" />
                      </Field>
                      <Field label="Job title" required>
                        <Input value={form.jobTitle} onChange={set("jobTitle")} className="rounded-xl" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="About your hiring" hint="Optional. Separate focus areas with commas.">
                          <Textarea value={form.reason ?? ""} onChange={set("reason")} rows={3} className="resize-none rounded-xl" />
                        </Field>
                      </div>
                      {avatarFile ? (
                        <div className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm sm:col-span-2">
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
                            aria-label="Remove selected photo"
                          >
                            <X className="h-4 w-4 text-[#64748b] hover:text-destructive" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <ProfileFieldRow icon={Phone} label="Phone number" value={profile.contactNumber ?? ""} />
                      <ProfileFieldRow icon={Briefcase} label="Job title" value={profile.jobTitle} />
                      <div className="sm:col-span-2">
                        <ProfileFieldRow icon={Sparkles} label="About your hiring" value={profile.reason ?? ""} />
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
                <p className="mb-5 mt-1 text-xs text-[#64748b]">
                  Add the accounts candidates and colleagues can use to recognize you.
                </p>
                <div className="space-y-4">
                  <LinkedInProfileUrlField
                    value={editing ? form.linkedinUrl ?? "" : profile.linkedinUrl ?? ""}
                    onChange={(value) => setForm((current) => ({ ...current, linkedinUrl: value }))}
                    readOnly={!editing}
                    onAddClick={startEdit}
                  />
                  {editing ? (
                    <Field label="Company website" hint="Optional">
                      <Input
                        value={form.companyWebsite ?? ""}
                        onChange={set("companyWebsite")}
                        placeholder="https://company.com"
                        className="rounded-xl"
                      />
                    </Field>
                  ) : (
                    <ProfileFieldRow icon={Globe} label="Company website" value={profile.companyWebsite ?? ""} />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="learner-stat-card min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                    <Building2 className="h-4 w-4" />
                    Company
                  </h3>
                  {!editing && <SectionEditButton onClick={startEdit} />}
                </div>
                {editing ? (
                  <div className="space-y-4">
                    <Field label="Company name" required>
                      <Input value={form.companyName} onChange={set("companyName")} className="rounded-xl" />
                    </Field>
                    <Field label="Job title" required>
                      <Input value={form.jobTitle} onChange={set("jobTitle")} className="rounded-xl" />
                    </Field>
                    <Field label="Company website" hint="Optional">
                      <Input
                        value={form.companyWebsite ?? ""}
                        onChange={set("companyWebsite")}
                        placeholder="https://company.com"
                        className="rounded-xl"
                      />
                    </Field>
                  </div>
                ) : (
                  <dl className="space-y-4">
                    <ReadOnlyRow label="Company name" value={profile.companyName} />
                    <ReadOnlyRow label="Job title" value={profile.jobTitle} />
                    <ReadOnlyRow label="Website" value={profile.companyWebsite ?? ""} />
                    <ReadOnlyRow label="Verification" value={verification} />
                    <ReadOnlyRow label="Verified on" value={profile.verifiedAt ? formatProfileDate(profile.verifiedAt) : ""} />
                  </dl>
                )}
              </div>

              <div className="learner-stat-card min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
                    <Calendar className="h-4 w-4" />
                    Hiring Information
                  </h3>
                  {!editing && <SectionEditButton onClick={startEdit} />}
                </div>
                {editing ? (
                  <Field label="What you hire for" hint="Optional. Example: frontend, data, graduate roles">
                    <Textarea value={form.reason ?? ""} onChange={set("reason")} rows={4} className="resize-none rounded-xl" />
                  </Field>
                ) : (
                  <dl className="space-y-4">
                    <ReadOnlyRow label="Hiring focus" value={profile.reason ?? ""} />
                    <ReadOnlyRow label="Member since" value={formatProfileDate(profile.createdAt)} />
                  </dl>
                )}
              </div>
            </div>

            <div className="learner-stat-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#023E8A]">Hiring Focus</h3>
                {!editing && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="flex items-center gap-1 text-xs font-medium text-[#023E8A] hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> Edit Focus
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {focusTags.length > 0 ? (
                  focusTags.map((tag) => (
                    <span key={tag} className="learner-skill-tag">
                      {tag}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-[#64748b]">No hiring focus added yet.</p>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-4 border-t border-[#e2e8f0] bg-[#f8fafc] px-4 pb-4 pt-3 sm:px-6 lg:w-[320px] lg:border-l lg:border-t-0 lg:p-6 lg:pt-4">
          <RecruiterProfileRightRail profile={profile} />
        </aside>
      </div>
    </AppShell>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { ConfirmDestructiveDialog } from "@/components/sijil/ConfirmDestructiveDialog";
import {
  Award,
  BadgeCheck,
  CompetencySkillRow,
  DonutChart,
  evidenceIconForIndex,
  Layers,
  OverviewRightRail,
  profileCompletion,
  skillBucket,
  StatCard,
} from "@/components/learner/OverviewDashboardPanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, ChevronRight, AlertTriangle, Briefcase, ArrowRight, Clock3, Info, LoaderCircle, Paperclip, Target, UsersRound } from "lucide-react";
import { IdentitySetupReminder } from "@/components/identity/IdentitySetupReminder";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { useAuth } from "@/hooks/useAuth";
import { daysSince, SKILL_DECAY_DAYS, isSkillDecaying, type DeclaredSkill } from "@/lib/sijil-data";
import {
  useCredentials,
  useDeclaredSkills,
  useLearnerProfile,
  usePeerReviews,
} from "@/hooks/useLearnerData";
import { toast } from "@/hooks/use-toast";
import { cn, formatSupabaseError } from "@/lib/utils";
import { listOpenJobsForLearners, matchJobSkills, type RecruiterJob } from "@/lib/recruiter-jobs";
import type { CandidateView } from "@/lib/db/candidates";
import { CONFIRMED_LABEL } from "@/lib/skill-confirmation-copy";

export default function LearnerProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const { skills, loading: skillsLoading, addSkill, removeSkill, updateSkill, refresh: refreshSkills } =
    useDeclaredSkills();
  const { credentials, loading: credsLoading } = useCredentials();
  const { reviews, refresh: refreshReviews } = usePeerReviews();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [declareQuery, setDeclareQuery] = useState("");
  const { user } = useAuth();
  const identity = useSsiIdentity();
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DeclaredSkill | null>(null);
  const [removing, setRemoving] = useState(false);
  const [openJobs, setOpenJobs] = useState<RecruiterJob[]>([]);

  const canSubmit = Boolean(name.trim());

  useEffect(() => {
    let active = true;
    void listOpenJobsForLearners()
      .then((rows) => {
        if (active) setOpenJobs(rows);
      })
      .catch(() => {
        if (active) setOpenJobs([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const matchingOpenJobs = useMemo(() => {
    const skillNames = skills.map((skill) => skill.name).filter(Boolean);
    const proxy = {
      verifiedSkills: skillNames,
      searchableSkills: skillNames,
      topSkill: skillNames[0] ?? "—",
    } as CandidateView;
    return openJobs
      .map((job) => ({ job, hits: matchJobSkills(job.skills, proxy) }))
      .filter((row) => row.hits.length > 0)
      .slice(0, 6);
  }, [openJobs, skills]);

  const skillSyncKey = useMemo(() => skills.map((s) => s.id).join("|"), [skills]);
  const decaying = useMemo(() => skills.filter((s) => isSkillDecaying(s)), [skills]);
  const notifPanelOpen = location.hash === "#notifications";
  const isEditing = editingId !== null;
  const loading = profileLoading || skillsLoading || credsLoading;

  useEffect(() => {
    void refreshReviews();
  }, [skillSyncKey, refreshReviews]);

  useEffect(() => {
    const refreshOnFocus = () => { void refreshSkills().catch(() => undefined); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refreshSkills]);

  const buckets = useMemo(() => {
    let verified = 0;
    let progress = 0;
    let idle = 0;
    for (const s of skills) {
      const b = skillBucket(s.status);
      if (b === "verified") verified += 1;
      else if (b === "progress") progress += 1;
      else idle += 1;
    }
    return { verified, progress, idle };
  }, [skills]);

  const evidenceCount = skills.filter((s) => skillBucket(s.status) !== "idle").length;

  const completion = profile
    ? profileCompletion([
        profile.contactNumber,
        profile.bio,
        profile.skillsSummary,
        profile.careerGoal,
        profile.city,
        profile.country,
        profile.avatarUrl,
      ])
    : 0;

  const recentSkills = useMemo(
    () =>
      [...skills]
        .sort((a, b) => (b.lastRelatedActivityAt ?? "").localeCompare(a.lastRelatedActivityAt ?? ""))
        .slice(0, 4),
    [skills],
  );

  const recentEvidence = recentSkills.filter((s) => skillBucket(s.status) !== "idle");

  const activities = useMemo(() => {
    const items: { label: string; time: string }[] = [];
    for (const s of recentSkills) {
      items.push({
        label: s.status === "Evidence Linked" ? "Evidence linked successfully" : `${s.name} — ${s.status}`,
        time: s.lastRelatedActivityAt ? `${daysSince(s.lastRelatedActivityAt) ?? 0} days ago` : "Recent",
      });
    }
    if (credentials.length > 0) {
      items.unshift({ label: "Credential issued to wallet", time: "Recent" });
    }
    if (profile) {
      items.push({ label: "Profile updated", time: "Recent" });
    }
    return items.slice(0, 5);
  }, [recentSkills, credentials, profile]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const openAddDialog = (prefill?: string) => {
    resetForm();
    if (prefill?.trim()) setName(prefill.trim());
    setOpen(true);
  };

  const openEditDialog = (skill: DeclaredSkill) => {
    setEditingId(skill.id);
    setName(skill.name);
    setOpen(true);
  };

  const handleSaveCompetency = async () => {
    if (!canSubmit || !user || saving) return;
    setSaving(true);
    try {
      const payload = { name: name.trim() };
      if (isEditing && editingId) {
        await updateSkill(editingId, payload);
        toast({ title: "Competency updated", description: `${payload.name} saved.` });
      } else {
        const created = await addSkill(payload);
        toast({
          title: "Competency added",
          description:
            created?.status === "Evidence Linked"
              ? `${payload.name} added and linked to matching platform evidence.`
              : `${payload.name} saved. Matching evidence may appear shortly.`,
        });
      }
      resetForm();
      setOpen(false);
      setDeclareQuery("");
    } catch (e) {
      toast({
        title: isEditing ? "Could not update competency" : "Could not add competency",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeSkill(removeTarget.id);
      toast({ title: "Competency removed" });
      setRemoveTarget(null);
    } catch (e) {
      toast({
        title: "Could not remove competency",
        description: formatSupabaseError(e),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  if (loading || !profile) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={6} />
      </LearnerWorkspaceShell>
    );
  }

  const rightRail = (
    <OverviewRightRail
      profile={profile}
      skills={skills}
      reviews={reviews}
      completion={completion}
      onDeclare={() => openAddDialog(declareQuery)}
    />
  );

  return (
    <LearnerWorkspaceShell variant="dashboard" rightRail={rightRail}>
      <div className="space-y-5">
        <IdentitySetupReminder
          loading={identity.loading}
          status={identity.snapshot.status}
          serverDid={identity.snapshot.server.did}
        />
        {notifPanelOpen && decaying.length > 0 && (
          <div id="notifications" className="learner-stat-card space-y-2 border-amber-200/80 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-sijil-blue">Notifications</p>
              <Button variant="ghost" size="sm" onClick={() => navigate(location.pathname, { replace: true })}>
                Close
              </Button>
            </div>
            {decaying.map((s) => {
              const d = daysSince(s.lastRelatedActivityAt);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/80 p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Competency velocity alert · {s.name}</p>
                    <p className="text-xs text-[#64748b]">
                      No related activity in {d ?? "—"} days (threshold {SKILL_DECAY_DAYS}d).
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/learner/integrations")}>
                    Sync now
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {matchingOpenJobs.length > 0 ? (
          <div className="learner-stat-card space-y-3 border-[#c7d7f0] p-4">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#023E8A]" />
              <p className="text-sm font-semibold text-[#023E8A]">Open roles matching your competencies</p>
            </div>
            <p className="text-xs text-[#64748b]">
              Recruiters opened these seats on SIJIL. Share the related competency credentials from your wallet so they can review you.
            </p>
            <ul className="space-y-2">
              {matchingOpenJobs.map(({ job, hits }) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0f172a]">{job.title}</p>
                    <p className="text-xs text-[#64748b]">Matches · {hits.join(", ")}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate("/learner/wallet")}>
                    Share credentials
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Award} label="Declared Competencies" value={skills.length} hint="Active skills" compact />
          <StatCard icon={Layers} label="Evidence Items" value={evidenceCount} hint="Linked sources" compact />
          <StatCard icon={UsersRound} label="Peer Reviews" value={reviews.length} hint="Context reviews" compact />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="learner-stat-card p-6">
            <h2 className="text-base font-semibold text-sijil-blue">Competency Progress</h2>
            <p className="text-sm text-slate-600">Track the status of your declared competencies.</p>
            <div className="mt-4 grid items-center gap-3 min-[420px]:grid-cols-[1fr_minmax(112px,0.8fr)]">
              <DonutChart {...buckets} />
              <ul className="space-y-2 text-sm">
                {[
                  { label: "In Progress", count: buckets.progress, color: "bg-sijil-blue" },
                  { label: "Not Started", count: buckets.idle, color: "bg-[#cbd5e1]" },
                  { label: CONFIRMED_LABEL, count: buckets.verified, color: "bg-[#14b8a6]" },
                ].map(({ label, count, color }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
                    <span className="text-[#334155]">{label}</span>
                    <span className="ml-auto font-semibold text-sijil-blue">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="learner-stat-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-sijil-blue">Declared Competencies</h2>
              <button
                type="button"
                onClick={() => openAddDialog()}
                className="text-xs font-medium text-sijil-blue hover:underline"
              >
                + Add new
              </button>
            </div>
            <ul className="mt-4 space-y-4">
              {skills.length === 0 ? (
                <li className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-sm text-slate-600">
                  <Layers className="mb-1 h-8 w-8 text-sijil-blue/50" aria-hidden="true" />
                  <p>No competencies yet.</p>
                  <button
                    type="button"
                    className="font-medium text-sijil-blue hover:underline"
                    onClick={() => openAddDialog()}
                  >
                    Declare your first competency
                  </button>
                </li>
              ) : (
                skills.map((skill) => (
                  <CompetencySkillRow
                    key={skill.id}
                    skill={skill}
                    onEdit={() => openEditDialog(skill)}
                    onDelete={() => setRemoveTarget(skill)}
                    onOpenPipeline={() => navigate(`/learner/validation/${skill.id}`)}
                  />
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="learner-declare-banner p-4 sm:px-5">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sijil-blue/10 text-sijil-blue">
                <Target className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-sijil-blue">Declare a New Competency</h2>
                <p className="text-sm text-slate-600">
                  Enter a competency name to begin collecting evidence from connected platforms.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row 2xl:w-auto">
              <Input
                aria-label="Competency name to declare"
                value={declareQuery}
                onChange={(e) => setDeclareQuery(e.target.value)}
                placeholder="Enter a competency name"
                className="h-11 flex-1 rounded-xl border-[#e2e8f0] bg-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") openAddDialog(declareQuery);
                }}
              />
              <Button
                className="h-11 shrink-0 rounded-xl bg-sijil-blue px-6 hover:bg-sijil-blue"
                onClick={() => openAddDialog(declareQuery)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Declare
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="learner-stat-card p-6">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-sijil-blue"><Paperclip className="h-5 w-5" aria-hidden="true" />Recent Evidence</h2>
            <ul className="mt-4 space-y-3">
              {recentEvidence.length === 0 ? (
                <li className="text-sm text-[#64748b]">No evidence linked yet.</li>
              ) : (
                recentEvidence.map((skill, index) => {
                  const Icon = evidenceIconForIndex(index);
                  const statusLabel =
                    skill.status === "Evidence Linked"
                      ? "Linked"
                      : skill.status.includes("Submitted")
                        ? "Submitted"
                        : "Uploaded";
                  return (
                    <li key={skill.id} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9]">
                        <Icon className="h-4 w-4 text-sijil-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-sijil-blue">{skill.name}</p>
                        <p className="text-xs text-[#64748b]">{skill.status}</p>
                      </div>
                      <span className="learner-tag-linked">{statusLabel}</span>
                      <span className="text-[10px] text-[#64748b]">
                        {skill.lastRelatedActivityAt
                          ? `${daysSince(skill.lastRelatedActivityAt) ?? 0} days ago`
                          : "Recent"}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="learner-stat-card p-6">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-sijil-blue"><Clock3 className="h-5 w-5" aria-hidden="true" />Recent Activity</h2>
            <ul className="mt-4 space-y-3">
              {activities.length === 0 ? (
                <li className="text-sm text-[#64748b]">No recent activity.</li>
              ) : (
                activities.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ccfbf1]">
                      <BadgeCheck className="h-3 w-3 text-[#0f766e]" />
                    </div>
                    <div>
                      <p className="text-sm text-sijil-blue">{item.label}</p>
                      <p className="text-xs text-[#64748b]">{item.time}</p>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <Link
              to="/learner/validation"
              className="mt-4 inline-flex items-center text-xs font-medium text-sijil-blue hover:underline"
            >
              View competency progress
              <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent overlayClassName="bg-slate-950/55 backdrop-blur-sm" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl bg-card p-0 shadow-2xl sm:rounded-2xl [&>button]:right-5 [&>button]:top-5">
          <DialogHeader className="flex-row items-center gap-4 space-y-0 border-b px-5 py-6 pr-12 text-left sm:px-8 sm:pr-14">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sijil-blue/10 text-sijil-blue sm:h-14 sm:w-14">
              <Layers className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="border-l pl-4">
              <DialogTitle className="text-xl font-bold leading-tight text-sijil-blue sm:text-2xl">
                {isEditing ? "Edit Competency" : "Declare a New Competency"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-slate-600">
                {isEditing ? "Update the name on your professional record." : "Add a skill to build your professional record."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void handleSaveCompetency(); }} aria-busy={saving}>
            <div className="space-y-4 px-5 py-6 sm:px-8">
              <div className="space-y-2">
                <Label htmlFor="competency-name" className="font-semibold text-sijil-blue">
                  Competency Name <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input
                  id="competency-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={saving}
                  aria-describedby={isEditing ? undefined : "competency-evidence-help"}
                  className="h-12 rounded-xl border-sijil-blue/30 px-4 text-base focus-visible:ring-sijil-blue"
                />
              </div>
              {!isEditing && (
                <p id="competency-evidence-help" className="flex items-start gap-3 rounded-xl bg-sijil-blue/5 p-3.5 text-sm text-slate-600">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-sijil-blue" aria-hidden="true" />
                  Only the name is required. You can link evidence from GitHub, LMS, and other connected platforms afterwards.
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 border-t px-5 py-5 sm:space-x-0 sm:px-8">
              <Button type="button" variant="outline" className="h-11 rounded-xl border-sijil-blue/50 px-6 text-sijil-blue"
                disabled={saving} onClick={() => handleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="h-11 gap-2 rounded-xl bg-sijil-blue px-6 text-white hover:bg-sijil-blue/90"
                disabled={!canSubmit || saving}>
                {saving ? "Saving?" : isEditing ? "Save Changes" : "Add Competency"}
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
        title="Remove declared competency?"
        description={`This will remove "${removeTarget?.name ?? "this competency"}" from your profile. Linked evidence history is preserved.`}
        confirmLabel="Remove competency"
        onConfirm={confirmRemove}
        loading={removing}
      />
    </LearnerWorkspaceShell>
  );
}

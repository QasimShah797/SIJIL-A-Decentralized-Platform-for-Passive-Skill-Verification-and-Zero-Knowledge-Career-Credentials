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
  Star,
} from "@/components/learner/OverviewDashboardPanels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, ChevronRight, AlertTriangle, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { daysSince, SKILL_DECAY_DAYS, isSkillDecaying, type DeclaredSkill } from "@/lib/sijil-data";
import {
  useCredentials,
  useDeclaredSkills,
  useLearnerProfile,
  usePeerReviews,
} from "@/hooks/useLearnerData";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DeclaredSkill | null>(null);
  const [removing, setRemoving] = useState(false);

  const canSubmit = Boolean(name.trim());

  const skillSyncKey = useMemo(() => skills.map((s) => s.id).join("|"), [skills]);
  const decaying = useMemo(() => skills.filter((s) => isSkillDecaying(s)), [skills]);
  const notifPanelOpen = location.hash === "#notifications";
  const isEditing = editingId !== null;
  const loading = profileLoading || skillsLoading || credsLoading;

  useEffect(() => {
    void refreshReviews();
  }, [skillSyncKey, refreshReviews]);

  useEffect(() => {
    void refreshSkills();
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
    if (profile?.bio) {
      items.push({ label: "Profile updated", time: "Recent" });
    }
    return items.slice(0, 5);
  }, [recentSkills, credentials, profile?.bio]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const handleDialogOpenChange = (next: boolean) => {
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
    if (!canSubmit || !user) return;
    setSaving(true);
    try {
      const payload = { name: name.trim() };
      if (isEditing && editingId) {
        await updateSkill(editingId, payload);
        toast({ title: "Competency updated", description: `${payload.name} saved.` });
      } else {
        const created = await addSkill(payload);
        toast({
          title: "Competency claimed",
          description:
            created?.status === "Evidence Linked"
              ? `${payload.name} added and linked to matching platform evidence.`
              : `${payload.name} added.`,
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
        description: e instanceof Error ? e.message : String(e),
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
      <div className="space-y-6">
        {notifPanelOpen && decaying.length > 0 && (
          <div id="notifications" className="learner-stat-card space-y-2 border-amber-200/80 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#023E8A]">Notifications</p>
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Award} label="Declared Competencies" value={skills.length} hint="Active skills" tint={0} />
          <StatCard icon={Layers} label="Evidence Items" value={evidenceCount} hint="Linked sources" tint={1} />
          <StatCard icon={BadgeCheck} label="Verifications" value={credentials.length} hint="Wallet credentials" tint={2} />
          <StatCard icon={Star} label="Peer Reviews" value={reviews.length} hint="Context reviews" tint={3} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="learner-stat-card p-6">
            <h2 className="text-base font-semibold text-[#023E8A]">Competency Progress</h2>
            <p className="text-xs text-[#64748b]">Verified · In Progress · Not Started</p>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
              <DonutChart {...buckets} />
              <ul className="space-y-2 text-sm">
                {[
                  { label: "Verified", count: buckets.verified, color: "bg-[#14b8a6]" },
                  { label: "In Progress", count: buckets.progress, color: "bg-[#023E8A]" },
                  { label: "Not Started", count: buckets.idle, color: "bg-[#cbd5e1]" },
                ].map(({ label, count, color }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
                    <span className="text-[#334155]">{label}</span>
                    <span className="ml-auto font-semibold text-[#023E8A]">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="learner-stat-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#023E8A]">Declared Competencies</h2>
              <button
                type="button"
                onClick={() => openAddDialog()}
                className="text-xs font-medium text-[#023E8A] hover:underline"
              >
                + Add new
              </button>
            </div>
            <ul className="mt-4 space-y-4">
              {skills.length === 0 ? (
                <li className="py-6 text-center text-sm text-[#64748b]">
                  No competencies yet.{" "}
                  <button
                    type="button"
                    className="font-medium text-[#023E8A] hover:underline"
                    onClick={() => openAddDialog()}
                  >
                    Declare your first
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

        <div className="learner-declare-banner p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <Sparkles className="h-6 w-6 text-[#023E8A]" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-[#023E8A]">Declare a New Competency</h2>
              <p className="text-sm text-[#64748b]">
                Enter a competency name to begin collecting evidence from connected platforms.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[420px]">
              <Input
                value={declareQuery}
                onChange={(e) => setDeclareQuery(e.target.value)}
                placeholder="Enter a competency name…"
                className="h-11 flex-1 rounded-xl border-[#e2e8f0] bg-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") openAddDialog(declareQuery);
                }}
              />
              <Button
                className="h-11 shrink-0 rounded-xl bg-[#023E8A] px-6 hover:bg-[#012A5C]"
                onClick={() => openAddDialog(declareQuery)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Declare
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="learner-stat-card p-6">
            <h2 className="text-base font-semibold text-[#023E8A]">Recent Evidence</h2>
            <ul className="mt-4 space-y-3">
              {recentSkills.length === 0 ? (
                <li className="text-sm text-[#64748b]">No evidence linked yet.</li>
              ) : (
                recentSkills.map((skill, index) => {
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
                        <Icon className="h-4 w-4 text-[#023E8A]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#023E8A]">{skill.name}</p>
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
            <h2 className="text-base font-semibold text-[#023E8A]">Recent Activity</h2>
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
                      <p className="text-sm text-[#023E8A]">{item.label}</p>
                      <p className="text-xs text-[#64748b]">{item.time}</p>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <Link
              to="/learner/validation"
              className="mt-4 inline-flex items-center text-xs font-medium text-[#023E8A] hover:underline"
            >
              View validation trail
              <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit competency" : "Declare a new competency"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Competency name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TypeScript"
                className="mt-1.5 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit && !saving) void handleSaveCompetency();
                }}
              />
              <p className="mt-1.5 text-xs text-[#64748b]">
                Only the name is required. Matching evidence is pulled from GitHub, LMS, and other connected platforms.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
              onClick={() => void handleSaveCompetency()}
              disabled={!canSubmit || saving}
            >
              {saving ? "Saving…" : isEditing ? "Save changes" : "Add competency"}
            </Button>
          </DialogFooter>
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

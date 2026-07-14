import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Bell,
  MessageSquare,
  UserCircle,
  Pencil,
  GitBranch,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { daysSince, SKILL_DECAY_DAYS, computeTrustSignals, isSkillDecaying, type DeclaredSkill } from "@/lib/sijil-data";
import { useLearnerProfile, useDeclaredSkills, usePeerReviews } from "@/hooks/useLearnerData";
import {
  COMPETENCY_DOMAINS,
  COMPETENCY_DOMAIN_OTHER,
  resolveCompetencyDomain,
  splitCompetencyDomain,
} from "@/lib/competency-domains";
import { toast } from "@/hooks/use-toast";

function displayStatus(status: string): string {
  if (status === "Skill Claimed") return "Competency Claimed";
  return status;
}

function statusVariant(status: string): "verified" | "info" | "neutral" | "warning" {
  if (status === "Credential Issued") return "verified";
  if (status === "Evidence Linked") return "info";
  if (status === "Review Available" || status === "Attestation Pending") return "warning";
  return "neutral";
}

export default function LearnerProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const { skills, loading: skillsLoading, addSkill, removeSkill, updateSkill } = useDeclaredSkills();
  const { reviews, refresh: refreshReviews } = usePeerReviews();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [domainSelect, setDomainSelect] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [desc, setDesc] = useState("");
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const resolvedDomain = resolveCompetencyDomain(domainSelect, customDomain);
  const canSubmit =
    Boolean(name.trim())
    && Boolean(domainSelect)
    && (domainSelect !== COMPETENCY_DOMAIN_OTHER || Boolean(customDomain.trim()));

  const decaying = useMemo(() => skills.filter((s) => isSkillDecaying(s)), [skills]);
  const trust = useMemo(() => computeTrustSignals(reviews), [reviews]);
  const skillSyncKey = useMemo(() => skills.map((s) => s.id).join("|"), [skills]);

  useEffect(() => {
    void refreshReviews();
  }, [skillSyncKey, refreshReviews]);
  const notifPanelOpen = location.hash === "#notifications";
  const isEditing = editingId !== null;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDomainSelect("");
    setCustomDomain("");
    setDesc("");
  };

  const handleDialogOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const openAddDialog = () => {
    resetForm();
    setOpen(true);
  };

  const openEditDialog = (skill: DeclaredSkill) => {
    const { select, custom } = splitCompetencyDomain(skill.domain);
    setEditingId(skill.id);
    setName(skill.name);
    setDomainSelect(select);
    setCustomDomain(custom);
    setDesc(skill.description ?? "");
    setOpen(true);
  };

  const handleSaveCompetency = async () => {
    if (!canSubmit || !user) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        domain: resolvedDomain,
        description: desc.trim(),
      };
      if (isEditing && editingId) {
        await updateSkill(editingId, payload);
        toast({ title: "Competency updated", description: `${payload.name} saved.` });
      } else {
        const created = await addSkill(payload);
        toast({
          title: "Competency claimed",
          description: created?.status === "Evidence Linked"
            ? `${payload.name} added and linked to matching GitHub evidence.`
            : `${payload.name} added.`,
        });
      }
      resetForm();
      setOpen(false);
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

  const handleRemove = async (id: string) => {
    try {
      await removeSkill(id);
      toast({ title: "Competency removed" });
    } catch (e) {
      toast({
        title: "Could not remove competency",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  if (profileLoading || skillsLoading) {
    return (
      <AppShell role="learner">
        <div className="text-sm text-muted-foreground">Loading profile…</div>
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Profile & Declared Competencies"
        description="Competencies here are claims you declare. SIJIL aggregates supporting records and reviews — it does not assign expertise levels."
        actions={
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-1.5" />
                Declare competency
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Category / Domain</Label>
                  <Select value={domainSelect || undefined} onValueChange={setDomainSelect}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select a domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPETENCY_DOMAINS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {domainSelect === COMPETENCY_DOMAIN_OTHER && (
                  <div>
                    <Label>Enter custom domain</Label>
                    <Input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="e.g. Game Development"
                      className="mt-1.5"
                    />
                  </div>
                )}
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Short description of the competency claim"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveCompetency} disabled={!canSubmit || saving}>
                  {saving ? "Saving…" : isEditing ? "Save changes" : "Add competency"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {notifPanelOpen && (
        <Card id="notifications" className="mb-6 border-amber-300/50">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
              {decaying.length > 0 && <StatusBadge variant="warning">{decaying.length} active</StatusBadge>}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate(location.pathname, { replace: true })}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {decaying.length === 0 ? (
              <div className="text-sm text-muted-foreground">All your competencies are fresh. No decay alerts.</div>
            ) : (
              decaying.map((s) => {
                const d = daysSince(s.lastRelatedActivityAt);
                return (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-md border bg-amber-50/40 dark:bg-amber-500/5 p-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">Competency velocity alert · {s.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        No related LMS/GitHub activity in the last {d === null ? "—" : `${d} days`} (threshold{" "}
                        {SKILL_DECAY_DAYS}d). Sync new evidence or run a fresh practical task to restore velocity.
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("/learner/integrations")}>
                      Sync now
                    </Button>
                    <Button size="sm" onClick={() => navigate("/learner/task")}>
                      Run task
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {profile && (
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-16 w-16 shrink-0 rounded-full border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                  {profile.avatar}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold truncate">{profile.name}</h2>
                  {profile.isVerifiedStudent && (
                    <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                      Verified Student
                    </StatusBadge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{profile.institution}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile.studentId && profile.studentId !== "—" && <span>Reg. {profile.studentId}</span>}
                  {profile.studentId && profile.studentId !== "—" && profile.program && profile.program !== "—" && (
                    <span> · </span>
                  )}
                  {profile.program && profile.program !== "—" && <span>{profile.program}</span>}
                </p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0" onClick={() => navigate("/learner/my-profile")}>
              <UserCircle className="mr-2 h-4 w-4" />
              View / Edit Profile
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Review & Trust Signals
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate("/learner/peer-reviews")}>
            Manage reviews <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Total reviews", value: trust.total },
              { label: "Verified context", value: trust.verifiedContext },
              { label: "Imported", value: trust.imported },
              { label: "SIJIL reviews", value: trust.sijil },
              { label: "High trust", value: trust.highTrust },
              { label: "Pending", value: trust.pending },
            ].map((s) => (
              <div key={s.label} className="rounded-md border bg-card p-3">
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
                <div className="text-base font-semibold mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Trust signals indicate context-verified peer feedback. They are not competency scores or expertise levels.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            Declared Competencies{" "}
            <span className="text-muted-foreground font-normal">({skills.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {skills.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">
              No competencies declared yet. Declare your first competency to begin verification.
            </div>
          ) : (
            <div className="divide-y">
              {skills.map((s) => {
                const d = daysSince(s.lastRelatedActivityAt);
                return (
                  <div key={s.id} className="px-6 py-4 hover:bg-muted/40 transition-colors">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <StatusBadge variant={statusVariant(s.status)}>
                            {displayStatus(s.status)}
                          </StatusBadge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{s.domain}</div>
                        {s.description ? (
                          <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Last related sync: {d === null ? "never" : `${d}d ago`}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(s)}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRemove(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Delete
                        </Button>
                        <Button size="sm" onClick={() => navigate(`/learner/validation/${s.id}`)}>
                          <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                          View Pipeline
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

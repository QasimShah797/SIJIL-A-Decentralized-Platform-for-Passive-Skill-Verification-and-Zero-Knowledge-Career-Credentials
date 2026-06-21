import { useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { InfoHint } from "@/components/sijil/InfoHint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronRight, ShieldCheck, AlertTriangle, Bell, MessageSquare, UploadCloud, X, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { uploadSkillEvidenceFile, submitSkillEvidenceAfterUpload } from "@/lib/db/skills";
import { isSkillDecaying, daysSince, SKILL_DECAY_DAYS, computeTrustSignals } from "@/lib/sijil-data";
import { useLearnerProfile, useDeclaredSkills, usePeerReviews } from "@/hooks/useLearnerData";
import { toast } from "@/hooks/use-toast";

export default function LearnerProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const { skills, loading: skillsLoading, addSkill, removeSkill } = useDeclaredSkills();
  const { reviews } = usePeerReviews();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [desc, setDesc] = useState("");
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ACCEPTED = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip";
  const MAX_MB = 10;
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (picked.size > MAX_MB * 1024 * 1024) {
      toast({ title: "File too large", description: `Max ${MAX_MB} MB.`, variant: "destructive" });
      return;
    }
    setFile(picked);
  };
  const clearFile = () => { setFile(null); if (fileRef.current) fileRef.current.value = ""; };

  const decaying = useMemo(() => skills.filter((s) => isSkillDecaying(s)), [skills]);
  const trust = useMemo(() => computeTrustSignals(reviews), [reviews]);
  const notifPanelOpen = location.hash === "#notifications";

  const handleAddSkill = async () => {
    if (!name || !user) return;
    setUploading(true);
    try {
      const created = await addSkill({ name, domain: domain || "General", description: desc });
      if (file && created) {
        const url = await uploadSkillEvidenceFile(user.id, created.id, file);
        await submitSkillEvidenceAfterUpload(user.id, created.id, file.name, url);
      }
      toast({
        title: "Skill claimed",
        description: created?.status === "Evidence Linked"
          ? `${name} added and linked to matching GitHub evidence.`
          : file ? `${name} added with file.` : `${name} added.`,
      });
      setName(""); setDomain(""); setDesc(""); clearFile(); setOpen(false);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeSkill(id);
    } catch (e) {
      toast({ title: "Could not remove skill", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const variant = (s: string) => s === "Credential Issued" ? "verified" : s === "Evidence Linked" ? "info" : "neutral";

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
        title="Profile & Declared Skills"
        description="Skills here are claims you declare. SIJIL aggregates supporting records and reviews — it does not assign expertise levels."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1.5" />Declare skill</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Declare a new skill</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Skill name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TypeScript" className="mt-1.5" />
                </div>
                <div>
                  <Label>Category / Domain</Label>
                  <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. Frontend Development" className="mt-1.5" />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description of the skill claim" className="mt-1.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Label>Supporting file</Label>
                    <span className="text-muted-foreground text-xs">(optional)</span>
                    <InfoHint text="Upload a project file, certificate, or any document supporting this skill. Max 10 MB." />
                  </div>
                  {file ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                      <button onClick={clearFile} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="w-full rounded-md border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors px-4 py-5 flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
                      <UploadCloud className="h-6 w-6" />
                      <span>Click to upload or drag & drop</span>
                      <span className="text-xs">PDF, DOC, PNG, JPG, ZIP · max 10 MB</span>
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFilePick} className="hidden" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleAddSkill} disabled={!name || uploading}>
                  {uploading ? "Adding…" : "Add skill"}
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
            <Button variant="ghost" size="sm" onClick={() => navigate(location.pathname, { replace: true })}>Close</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {decaying.length === 0 ? (
              <div className="text-sm text-muted-foreground">All your skills are fresh. No decay alerts.</div>
            ) : decaying.map((s) => {
              const d = daysSince(s.lastRelatedActivityAt);
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-md border bg-amber-50/40 dark:bg-amber-500/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">Skill velocity alert · {s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      No related LMS/GitHub activity in the last {d === null ? "—" : `${d} days`} (threshold {SKILL_DECAY_DAYS}d). Sync new evidence or run a fresh practical task to restore velocity.
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/learner/integrations")}>Sync now</Button>
                  <Button size="sm" onClick={() => navigate("/learner/task")}>Run task</Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {profile && (
        <Card className="mb-6">
          <CardContent className="p-6 flex flex-col md:flex-row md:items-center gap-6">
            <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold">
              {profile.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>DID active</StatusBadge>
              </div>
              <div className="text-sm text-muted-foreground">{profile.program} · {profile.batch} · {profile.institution}</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Holder DID</span>
                <span className="mono break-all">{profile.did}</span>
                <InfoHint text="Decentralized Identifier under learner's control. Used to bind issued credentials to the holder." />
              </div>
            </div>
            <Button variant="outline"><Pencil className="h-4 w-4 mr-1.5" />Edit profile</Button>
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
            Trust signals indicate context-verified peer feedback. They are not skill scores or expertise levels.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Declared skills <span className="text-muted-foreground font-normal">({skills.length})</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {skills.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">
              No skills declared yet. Click &quot;Declare skill&quot; to add your first skill claim.
            </div>
          ) : (
            <div className="divide-y">
              {skills.map((s) => {
                const decay = isSkillDecaying(s);
                const d = daysSince(s.lastRelatedActivityAt);
                return (
                  <div key={s.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition-colors group">
                    <button
                      onClick={() => navigate(`/learner/validation/${s.id}`)}
                      className="flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <StatusBadge variant={variant(s.status) as "verified" | "info" | "neutral"}>{s.status}</StatusBadge>
                        {decay && (
                          <StatusBadge variant="warning" icon={<AlertTriangle className="h-3 w-3" />}>Decaying</StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {s.domain}{s.description ? ` · ${s.description}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Last related sync: {d === null ? "never" : `${d}d ago`}
                      </div>
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/learner/validation/${s.id}`)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
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

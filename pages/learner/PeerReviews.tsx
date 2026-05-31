import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Github, GraduationCap, Sparkles, Users, ShieldCheck, AlertTriangle, CircleSlash,
  Star, Mail, Download, MessageSquare, Copy, Link as LinkIcon, ExternalLink,
  RefreshCw, Eye, Inbox,
} from "lucide-react";
import {
  declaredSkills, learnerProfile, getProjects, getPeerReviews, addPeerReview,
  getInvitations, addInvitation, computeTrustSignals,
  autoProcessProjectContributors, getContributorRows, resendInvitation,
  type PeerReview, type ContextSource, type Project, type ProjectContributor,
  type ReviewInvitation, type ContributorVerification, type ContributorReviewStatus,
} from "@/lib/sijil-data";
import { toast } from "@/hooks/use-toast";

function sourceIcon(s: ContextSource) {
  if (s === "GitHub") return <Github className="h-3.5 w-3.5" />;
  if (s === "LMS") return <GraduationCap className="h-3.5 w-3.5" />;
  if (s === "Spark") return <Sparkles className="h-3.5 w-3.5" />;
  return <Users className="h-3.5 w-3.5" />;
}

function contribVariant(s: ContributorVerification | undefined) {
  if (s === "Contributor Verified") return "verified" as const;
  if (s === "Contributor Pending Verification") return "warning" as const;
  if (s === "Not a Project Contributor") return "destructive" as const;
  return "neutral" as const;
}
function trustVariant(t: PeerReview["trustWeight"]) {
  if (t === "High Trust") return "verified" as const;
  if (t === "Medium Trust") return "info" as const;
  if (t === "Blocked") return "destructive" as const;
  return "neutral" as const;
}

export default function PeerReviewsPage() {
  const [projects] = useState<Project[]>(getProjects());
  const [reviews, setReviews] = useState<PeerReview[]>(getPeerReviews());
  const [invitations, setInvitations] = useState<ReviewInvitation[]>(getInvitations());
  const signals = useMemo(() => computeTrustSignals(reviews), [reviews]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? "");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const [skillForProject, setSkillForProject] = useState<string>(
    selectedProject?.linkedSkills[0] ?? declaredSkills[0]?.name ?? "",
  );

  // Auto-detect: when a project is opened (or skill changes for it), import existing
  // platform reviews and send invites to the rest. Avoids duplicates.
  const processedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedProject) return;
    const key = `${selectedProject.id}::${skillForProject}`;
    if (processedRef.current.has(key)) return;
    processedRef.current.add(key);
    const r = autoProcessProjectContributors(selectedProject, learnerProfile.name, skillForProject);
    if (r.imported || r.invited) {
      setReviews(getPeerReviews());
      setInvitations(getInvitations());
      toast({
        title: "Contributors processed automatically",
        description: `${r.imported} imported review(s), ${r.invited} invite(s) sent for ${selectedProject.name}.`,
      });
    }
  }, [selectedProject, skillForProject]);

  const contributorRows = useMemo(
    () => (selectedProject ? getContributorRows(selectedProject) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProject, reviews, invitations],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteContrib, setInviteContrib] = useState<ProjectContributor | null>(null);
  const [inviteSkill, setInviteSkill] = useState<string>(skillForProject);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const reviewedContributorIds = useMemo(() => {
    if (!selectedProject) return new Set<string>();
    return new Set(
      reviews
        .filter((r) => r.projectId === selectedProject.id)
        .map((r) => {
          // Match by handle or by name
          const c = selectedProject.contributors.find(
            (x) => x.handle === r.reviewerName || x.name === r.reviewerName,
          );
          return c?.id ?? `name:${r.reviewerName}`;
        }),
    );
  }, [reviews, selectedProject]);

  const invitedContributorIds = useMemo(() => {
    if (!selectedProject) return new Set<string>();
    return new Set(
      invitations.filter((i) => i.projectId === selectedProject.id).map((i) => i.contributorId),
    );
  }, [invitations, selectedProject]);

  const openInvite = (c: ProjectContributor) => {
    setInviteContrib(c);
    setInviteSkill(skillForProject);
    setInviteEmail(c.email ?? "");
    setGeneratedLink(null);
    setInviteOpen(true);
  };

  const sendInvite = () => {
    if (!selectedProject || !inviteContrib) return;
    if (!inviteEmail.trim()) {
      toast({ title: "Email required", description: "We need a contact email to send the review invitation." });
      return;
    }
    const inv: ReviewInvitation = {
      id: `inv-${Date.now()}`,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      source: selectedProject.source,
      contributorId: inviteContrib.id,
      contributorName: inviteContrib.name,
      contributorEmail: inviteEmail.trim(),
      contributorRole: inviteContrib.role,
      learnerName: learnerProfile.name,
      skill: inviteSkill,
      status: "Sent",
      sentAt: new Date().toISOString(),
    };
    addInvitation(inv);
    setInvitations([inv, ...invitations]);
    const link = `${window.location.origin}/review/${inv.id}`;
    setGeneratedLink(link);
    toast({
      title: "Invitation email sent",
      description: `Invited ${inviteContrib.name} to review ${learnerProfile.name} for ${inviteSkill} on ${selectedProject.name}.`,
    });
  };

  const importExisting = () => {
    if (!selectedProject) return;
    // Demo: synthesize an "imported review" from an existing contributor of the project.
    const verified = selectedProject.contributors.find(
      (c) => !reviewedContributorIds.has(c.id),
    );
    if (!verified) {
      toast({ title: "No more reviews to import", description: "All contributors of this project already have a stored review." });
      return;
    }
    const skill = skillForProject;
    const origin: PeerReview["origin"] =
      selectedProject.source === "GitHub" ? "GitHub PR"
      : selectedProject.source === "LMS" ? "LMS Assignment"
      : selectedProject.source === "Spark" ? "Spark Comment"
      : "SIJIL";
    const rec: PeerReview = {
      id: `pr-${Date.now()}`,
      reviewerName: verified.handle ?? verified.name,
      reviewerRole: verified.role,
      source: selectedProject.source,
      origin,
      skill,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      evidenceLabel: `${selectedProject.evidenceLabel} — auto-imported ${origin}`,
      evidenceUrl: selectedProject.url,
      rating: 4,
      comment: `Auto-imported ${origin} from ${verified.name}: contributed code/feedback on ${selectedProject.name}.`,
      recommendation: "Recommended",
      date: new Date().toISOString(),
      contextStatus: "Context Verified",
      contributorVerification: "Contributor Verified",
      trustWeight: "High Trust",
      imported: true,
    };
    addPeerReview(rec);
    setReviews([rec, ...reviews]);
    toast({ title: "Review imported", description: `${rec.reviewerName}'s ${origin} stored as a verified trust signal.` });
  };

  return (
    <AppShell role="learner">
      <PageHeader
        title="Peer Reviews & Trust Signals"
        description="Only verified contributors of the same project can review this learner. SIJIL stores reviews as evidence-based trust signals — never as expert/intermediate/beginner labels."
        actions={
          <Button variant="outline" onClick={importExisting} disabled={!selectedProject}>
            <Download className="h-4 w-4 mr-1.5" />Import existing review
          </Button>
        }
      />

      {/* Trust signals summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat label="Total reviews" value={signals.total} />
        <Stat label="Context verified" value={signals.verifiedContext} />
        <Stat label="Imported" value={signals.imported} />
        <Stat label="From SIJIL form" value={signals.sijil} />
        <Stat label="High trust" value={signals.highTrust} />
        <Stat label="Pending invites" value={invitations.filter((i) => i.status !== "Completed").length} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Project picker + contributor list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Project contributors
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pick a project linked as evidence. Only its verified contributors can review the learner.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Project / evidence source</Label>
                <Select value={selectedProjectId} onValueChange={(v) => {
                  setSelectedProjectId(v);
                  const p = projects.find((x) => x.id === v);
                  if (p) setSkillForProject(p.linkedSkills[0] ?? skillForProject);
                }}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Skill being reviewed</Label>
                <Select value={skillForProject} onValueChange={setSkillForProject}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(selectedProject?.linkedSkills.length
                      ? selectedProject.linkedSkills
                      : declaredSkills.map((s) => s.name)).map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedProject && (
              <div className="rounded-md border p-3 bg-muted/30 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge variant="neutral" icon={sourceIcon(selectedProject.source)}>
                    {selectedProject.source}
                  </StatusBadge>
                  <span className="font-medium">{selectedProject.name}</span>
                  {selectedProject.url && (
                    <a className="text-xs text-muted-foreground inline-flex items-center gap-1 underline" href={selectedProject.url} target="_blank" rel="noreferrer">
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{selectedProject.evidenceLabel}</div>
              </div>
            )}

            <div className="divide-y rounded-md border">
              {selectedProject?.contributors.map((c) => {
                const reviewed = reviewedContributorIds.has(c.id);
                const invited = invitedContributorIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {c.name}
                        {c.handle && <span className="text-xs text-muted-foreground">@{c.handle}</span>}
                        <StatusBadge variant="outline">{c.role}</StatusBadge>
                        <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                          Contributor Verified
                        </StatusBadge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.email ?? "no email on file"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {reviewed ? (
                        <StatusBadge variant="info"><MessageSquare className="h-3 w-3" /> Reviewed</StatusBadge>
                      ) : invited ? (
                        <StatusBadge variant="warning"><Mail className="h-3 w-3" /> Invite sent</StatusBadge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openInvite(c)}>
                          <Mail className="h-4 w-4 mr-1.5" />Send review invite
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!selectedProject?.contributors.length && (
                <div className="p-4 text-sm text-muted-foreground">No contributors found for this project.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trust labels */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trust labels SIJIL uses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge variant="info">Contributor Reviewed</StatusBadge>
              <StatusBadge variant="verified">Project Context Verified</StatusBadge>
              <StatusBadge variant="info">Trust Signal Available</StatusBadge>
              <StatusBadge variant="neutral">Evidence Supported</StatusBadge>
              <StatusBadge variant="warning">Needs More Evidence</StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              SIJIL never displays Expert / Intermediate / Beginner labels or numeric skill scores. Recruiters interpret evidence themselves.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invitations sent */}
      {invitations.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Review invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {invitations.map((i) => (
                <div key={i.id} className="px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{i.contributorName} <span className="text-xs text-muted-foreground">· {i.contributorEmail}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {i.skill} · {i.projectName} ({i.source}) · {new Date(i.sentAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={i.status === "Completed" ? "verified" : "warning"}>{i.status}</StatusBadge>
                    <Button size="sm" variant="outline" onClick={() => {
                      const link = `${window.location.origin}/review/${i.id}`;
                      navigator.clipboard.writeText(link);
                      toast({ title: "Link copied", description: link });
                    }}>
                      <Copy className="h-3 w-3 mr-1" />Copy link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contributor Review Invitations — auto-detected per project */}
      {selectedProject && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Contributor Review Invitations
              <span className="text-xs font-normal text-muted-foreground">
                · {selectedProject.name} ({selectedProject.source})
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Auto-detected verified contributors of this project. SIJIL imports any existing platform reviews and sends a review invite to the rest. You can resend invites or verify contributors manually.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {contributorRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No verified project contributors found for this evidence yet.
              </div>
            ) : (
              <div className="divide-y">
                {contributorRows.map((row) => {
                  const c = row.contributor;
                  const statusVariant: "verified" | "warning" | "info" | "neutral" | "destructive" =
                    row.status === "Imported Review Found" ? "verified"
                    : row.status === "Review Received" ? "verified"
                    : row.status === "Invite Sent" ? "warning"
                    : row.status === "Review Pending" ? "neutral"
                    : "destructive";
                  return (
                    <div key={c.id} className="px-6 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center flex-wrap gap-2">
                          {c.name}
                          {c.handle && <span className="text-xs text-muted-foreground">@{c.handle}</span>}
                          <StatusBadge variant="outline">{c.role}</StatusBadge>
                          <StatusBadge variant="neutral" icon={sourceIcon(selectedProject.source)}>
                            {selectedProject.source}
                          </StatusBadge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.email ?? "no email on file"} · project: {selectedProject.name}
                          {row.lastInviteAt && <> · last invite: {new Date(row.lastInviteAt).toLocaleDateString()}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge variant={statusVariant}>{row.status}</StatusBadge>
                        {row.status === "Imported Review Found" && row.reviewId && (
                          <Button size="sm" variant="outline" onClick={() => {
                            document.getElementById(`review-${row.reviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}>
                            <Eye className="h-3 w-3 mr-1" />View imported review
                          </Button>
                        )}
                        {row.status === "Review Received" && row.reviewId && (
                          <Button size="sm" variant="outline" onClick={() => {
                            document.getElementById(`review-${row.reviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}>
                            <Eye className="h-3 w-3 mr-1" />View submitted review
                          </Button>
                        )}
                        {row.status === "Invite Sent" && row.invitationId && (
                          <Button size="sm" variant="outline" onClick={() => {
                            resendInvitation(row.invitationId!);
                            setInvitations(getInvitations());
                            toast({ title: "Invite resent", description: `${c.name} has been re-invited to review.` });
                          }}>
                            <RefreshCw className="h-3 w-3 mr-1" />Resend invite
                          </Button>
                        )}
                        {row.status === "Review Pending" && (
                          <Button size="sm" variant="outline" onClick={() => openInvite(c)}>
                            <Mail className="h-3 w-3 mr-1" />Send invite
                          </Button>
                        )}
                        {row.status === "Not a Project Contributor" ? (
                          <Button size="sm" variant="outline" disabled>
                            <CircleSlash className="h-3 w-3 mr-1" />Not eligible
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => {
                            toast({ title: "Contributor verified", description: `${c.name} is a verified contributor of ${selectedProject.name}.` });
                          }}>
                            <ShieldCheck className="h-3 w-3 mr-1" />Verify contributor
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Reviews ({reviews.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {reviews.map((r) => <ReviewCard key={r.id} r={r} />)}
            {reviews.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No peer reviews yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite contributor to review</DialogTitle>
          </DialogHeader>
          {inviteContrib && selectedProject && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                You are inviting a verified contributor of <span className="font-medium text-foreground">{selectedProject.name}</span> to review your work on this project. SIJIL will send them an email with a secure form link.
              </p>
              <div>
                <Label>Reviewer</Label>
                <div className="mt-1.5 rounded-md border p-2 bg-muted/30">
                  {inviteContrib.name} {inviteContrib.handle && <span className="text-xs text-muted-foreground">@{inviteContrib.handle}</span>}
                  <div className="text-xs text-muted-foreground">{inviteContrib.role} · Contributor Verified</div>
                </div>
              </div>
              <div>
                <Label>Contact email</Label>
                <Input className="mt-1.5" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="reviewer@example.com" />
              </div>
              <div>
                <Label>Skill / competency</Label>
                <Select value={inviteSkill} onValueChange={setInviteSkill}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(selectedProject.linkedSkills.length
                      ? selectedProject.linkedSkills
                      : declaredSkills.map((s) => s.name)).map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {generatedLink && (
                <div className="rounded-md border p-2 bg-success-soft/40 text-xs">
                  <div className="flex items-center gap-1 font-medium text-success"><LinkIcon className="h-3 w-3" /> Email sent — preview reviewer link:</div>
                  <div className="mt-1 mono break-all">{generatedLink}</div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedLink); toast({ title: "Link copied" }); }}>
                      <Copy className="h-3 w-3 mr-1" />Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(generatedLink, "_blank")}>
                      <ExternalLink className="h-3 w-3 mr-1" />Open form
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Close</Button>
            {!generatedLink && <Button onClick={sendInvite}><Mail className="h-4 w-4 mr-1.5" />Send invitation email</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export function ReviewCard({ r }: { r: PeerReview }) {
  return (
    <div id={`review-${r.id}`} className="px-6 py-4 scroll-mt-24">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="font-medium">{r.reviewerName}</span>
            <StatusBadge variant="outline">{r.reviewerRole}</StatusBadge>
            <StatusBadge variant="neutral" icon={sourceIcon(r.source)}>{r.source}</StatusBadge>
            {r.imported
              ? <StatusBadge variant="info">Imported · {r.origin}</StatusBadge>
              : <StatusBadge variant="info">SIJIL Form Review</StatusBadge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            On <span className="font-medium text-foreground">{r.skill}</span>
            {r.projectName && <> · project: <span className="font-medium text-foreground">{r.projectName}</span></>}
            {" · evidence: "}{r.evidenceLabel || "—"}
            {r.evidenceUrl && (
              <> · <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="underline">open</a></>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            variant={contribVariant(r.contributorVerification)}
            icon={r.contributorVerification === "Contributor Verified"
              ? <ShieldCheck className="h-3 w-3" />
              : r.contributorVerification === "Contributor Pending Verification"
              ? <AlertTriangle className="h-3 w-3" />
              : <CircleSlash className="h-3 w-3" />}
          >
            {r.contributorVerification ?? "Contributor Pending Verification"}
          </StatusBadge>
          <StatusBadge variant={trustVariant(r.trustWeight)}>Trust signal: {r.trustWeight}</StatusBadge>
          {r.recommendation && (
            <StatusBadge variant={r.recommendation === "Recommended" ? "verified" : "warning"}>
              {r.recommendation}
            </StatusBadge>
          )}
          <div className="flex items-center text-amber-500 text-sm">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "opacity-30"}`} />
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm mt-3 whitespace-pre-line">{r.comment}</p>
      <div className="text-[11px] text-muted-foreground mt-2">{new Date(r.date).toLocaleDateString()}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

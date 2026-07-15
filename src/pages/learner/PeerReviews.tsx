import { useEffect, useMemo, useState } from "react";
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
  computeTrustSignals,
  type PeerReview, type ContextSource, type ProjectContributor,
  type ReviewInvitation, type ContributorVerification,
} from "@/lib/sijil-data";
import { formatPeerReviewDate } from "@/lib/peer-review-date";
import { useAuth } from "@/hooks/useAuth";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { fetchLearnerProfile } from "@/lib/db/learner-profile";
import {
  loadPeerReviewPageData,
  buildContributorRows,
  contextRequestToInvitation,
  type PeerReviewProject,
  type ContextReviewRequestDisplay,
} from "@/lib/db/peer-review-page";
import {
  importExternalReviewsApi,
} from "@/services/api/reviews.api";
import {
  createPeerReviewInviteApi,
  getPeerReviewStatsApi,
  getPeerReviewContributorsApi,
  type PeerReviewStatsApi,
} from "@/services/api/peer-review.api";
import { isApiEnabled } from "@/services/api/client";
import { supabase } from "@/integrations/supabase/client";
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

type InviteReviewer = {
  id?: string;
  name: string;
  githubUsername: string | null;
  role: ProjectContributor["role"];
};

/** Contributor GitHub login only — never the repo owner / learner login. */
function contributorToInviteReviewer(
  contributor: ProjectContributor,
  learnerGithubLogin: string | null,
): InviteReviewer {
  const rawLogin =
    contributor.handle?.replace("@", "").trim()
    || null;
  const learnerLogin = learnerGithubLogin?.replace("@", "").trim().toLowerCase() || null;
  const loginLower = rawLogin?.toLowerCase() ?? null;
  const isLearnerLogin = Boolean(loginLower && learnerLogin && loginLower === learnerLogin);

  return {
    id: contributor.id,
    name: contributor.name,
    githubUsername: rawLogin && !isLearnerLogin ? rawLogin : null,
    role: contributor.role,
  };
}

export default function PeerReviewsPage() {
  const { user } = useAuth();
  const { skills: declaredSkills } = useDeclaredSkills();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<PeerReviewProject[]>([]);
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [legacyInvitations, setLegacyInvitations] = useState<ReviewInvitation[]>([]);
  const [contextRequests, setContextRequests] = useState<ContextReviewRequestDisplay[]>([]);
  const [learnerName, setLearnerName] = useState("Learner");

  const [apiStats, setApiStats] = useState<PeerReviewStatsApi | null>(null);

  const invitations = useMemo(
    () => [
      ...contextRequests.map(contextRequestToInvitation),
      ...legacyInvitations,
    ],
    [contextRequests, legacyInvitations],
  );

  const signals = useMemo(() => {
    if (apiStats) {
      return {
        total: apiStats.totalReviews,
        verifiedContext: apiStats.contextVerified,
        imported: apiStats.imported,
        sijil: apiStats.fromSIJILForm,
        highTrust: apiStats.highTrust,
        pending: apiStats.pendingInvites,
      };
    }
    return computeTrustSignals(reviews);
  }, [apiStats, reviews]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const [skillForProject, setSkillForProject] = useState<string>("");

  const reload = async () => {
    if (!user?.id) return;
    try {
      const [data, stats] = await Promise.all([
        loadPeerReviewPageData(user.id),
        isApiEnabled() ? getPeerReviewStatsApi() : Promise.resolve(null),
      ]);
      setProjects(data.projects);
      setReviews(data.reviews);
      setLegacyInvitations(data.legacyInvitations);
      setContextRequests(data.contextRequests);
      if (stats) setApiStats(stats);
      if (!selectedProjectId && data.projects[0]) {
        setSelectedProjectId(data.projects[0].id);
        setSkillForProject(
          data.projects[0].linkedSkills[0] ?? declaredSkills[0]?.name ?? "",
        );
      }
    } catch {
      throw new Error("load failed");
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    fetchLearnerProfile(user.id, user.email)
      .then((p) => setLearnerName(p.name))
      .catch(() => setLearnerName(user.email?.split("@")[0] ?? "Learner"));
    supabase
      .from("github_connections")
      .select("github_username")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setLearnerGithub(data?.github_username ?? null));
    reload()
      .catch(() => {
        toast({
          title: "Could not load reviews",
          description: "Check GitHub sync on Integrations and try refreshing.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user?.id) return;
    reload()
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, declaredSkills.map((skill) => skill.id).join("|")]);

  useEffect(() => {
    if (selectedProject && !skillForProject) {
      setSkillForProject(selectedProject.linkedSkills[0] ?? declaredSkills[0]?.name ?? "");
    }
  }, [selectedProject, skillForProject, declaredSkills]);

  useEffect(() => {
    if (!selectedProjectId || !isApiEnabled()) return;
    getPeerReviewContributorsApi(selectedProjectId)
      .then((contributors) => {
        if (!contributors?.length) return;
        setProjects((prev) => prev.map((p) => (
          p.id === selectedProjectId
            ? {
              ...p,
              contributors: contributors.map((c) => ({
                id: c.id,
                name: c.name,
                handle: c.handle,
                email: c.email,
                role: c.role as ProjectContributor["role"],
                avatarUrl: c.avatarUrl,
              })),
            }
            : p
        )));
      })
      .catch(() => undefined);
  }, [selectedProjectId]);

  const contributorRows = useMemo(
    () => (selectedProject
      ? buildContributorRows(selectedProject, reviews, contextRequests, legacyInvitations)
      : []),
    [selectedProject, reviews, contextRequests, legacyInvitations],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResend, setInviteResend] = useState(false);
  const [inviteContrib, setInviteContrib] = useState<ProjectContributor | null>(null);
  const [inviteSkill, setInviteSkill] = useState<string>(skillForProject);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [learnerGithub, setLearnerGithub] = useState<string | null>(null);

  const selectedReviewer = useMemo(
    () => (inviteContrib ? contributorToInviteReviewer(inviteContrib, learnerGithub) : null),
    [inviteContrib, learnerGithub],
  );

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
      invitations
        .filter((i) => i.projectId === selectedProject.id && i.status !== "Completed")
        .map((i) => i.contributorId),
    );
  }, [invitations, selectedProject]);

  const openInvite = (c: ProjectContributor) => {
    setInviteResend(false);
    setInviteContrib(c);
    setInviteSkill(skillForProject);
    setInviteEmail(c.email ?? "");
    setGeneratedLink(null);
    setInviteOpen(true);
  };

  const openResendInvite = (c: ProjectContributor) => {
    const pendingInvite = invitations.find(
      (i) => i.projectId === selectedProject?.id
        && i.contributorId === c.id
        && i.status !== "Completed",
    );
    setInviteResend(true);
    setInviteContrib(c);
    setInviteSkill(skillForProject);
    setInviteEmail(pendingInvite?.contributorEmail ?? c.email ?? "");
    setGeneratedLink(null);
    setInviteOpen(true);
  };

  const sendInvite = async () => {
    if (!selectedProject) return;
    if (!inviteContrib) return;
    if (!inviteEmail.trim()) {
      toast({ title: "Email required", description: "We need a contact email to send the review invitation." });
      return;
    }
    if (!isApiEnabled()) {
      toast({
        title: "Backend required",
        description: "Start the backend (npm run dev in backend/) and ensure VITE_API_BASE_URL is configured.",
        variant: "destructive",
      });
      return;
    }

    const normalizedEmail = (inviteContrib.email ?? inviteEmail).trim().toLowerCase();
    if (!normalizedEmail) {
      toast({
        title: "Contributor email required",
        description: "Sync GitHub contributors or wait for a verified contact email before inviting this reviewer.",
        variant: "destructive",
      });
      return;
    }

    const contributorId = inviteContrib.id;
    const inviteTargetName = inviteContrib.name;

    const skillLink = selectedProject.skillLinks.find((s) => s.skillName === inviteSkill)
      ?? selectedProject.skillLinks[0];
    const declaredSkill = declaredSkills.find((s) => s.name === inviteSkill)
      ?? declaredSkills.find((s) => s.name === skillForProject);
    const skillId = skillLink?.skillId ?? declaredSkill?.id;
    if (!skillId) {
      toast({
        title: "Skill required",
        description: "Select a declared skill or link this repository to a skill on Integrations.",
      });
      return;
    }

    let apiError = "";
    const result = await createPeerReviewInviteApi({
      projectId: selectedProject.id,
      contributorId,
      skillId,
      contributorEmail: normalizedEmail,
      resend: inviteResend,
    }, (msg) => { apiError = msg; });

    if (!result) {
      toast({
        title: "Request failed",
        description: apiError || "Could not send review invitation. Check that the backend is running.",
        variant: "destructive",
      });
      return;
    }

    if (result.alreadyReviewed) {
      toast({
        title: "Review already exists",
        description: `${inviteTargetName} has already submitted a review for this project.`,
      });
      return;
    }

    setGeneratedLink(result.reviewLink);
    await reload();
    toast({
      title: result.status === "resent"
        ? "Invitation resent"
        : result.status === "already_invited"
          ? "Invitation already pending"
          : "Review invitation sent",
      description: result.status === "resent"
        ? `Review link emailed again to ${normalizedEmail}.`
        : result.status === "already_invited"
          ? `An invitation is already pending for ${normalizedEmail}. Use Resend if you need to email the link again.`
          : `Review invitation emailed to ${normalizedEmail} for ${inviteSkill} on ${selectedProject.name}.`,
    });
  };

  const importExisting = async () => {
    if (!selectedProject || !isApiEnabled()) {
      toast({
        title: "Backend required",
        description: "Ensure VITE_API_BASE_URL is set and the backend is running.",
        variant: "destructive",
      });
      return;
    }
    if (selectedProject.source !== "GitHub") {
      toast({
        title: "GitHub only",
        description: "GitHub REST import is available for synced GitHub repositories.",
      });
      return;
    }

    let apiError = "";
    const result = await importExternalReviewsApi({
      evidenceId: selectedProject.evidenceRecordId,
      projectId: selectedProject.id,
    }, (msg) => { apiError = msg; });

    if (!result) {
      toast({
        title: "Import failed",
        description: apiError || "Could not reach the import API. Is the backend running?",
        variant: "destructive",
      });
      return;
    }

    await reload();
    const imported = result.imported ?? 0;
    if (imported > 0) {
      toast({ title: "Reviews imported", description: `${imported} GitHub review(s) imported from verified contributors.` });
    } else {
      toast({
        title: "No external reviews found",
        description: "No PR reviews or comments from verified repo contributors were found for this project.",
      });
    }
  };

  return (
    <AppShell role="learner">
      <PageHeader
        title="Peer Reviews & Trust Signals"
        description="Only verified contributors of the same project can review this learner. SIJIL stores reviews as evidence-based trust signals — never as expert/intermediate/beginner labels."
        actions={
          <Button variant="outline" onClick={() => void importExisting()} disabled={!selectedProject || loading}>
            <Download className="h-4 w-4 mr-1.5" />Import existing review
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground mb-6">Loading your reviews…</div>
      ) : declaredSkills.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground mb-6">
          No declared competencies yet. Add a competency on <strong>My Profile</strong> and link GitHub evidence on <strong>Integrations</strong> before requesting peer reviews.
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground mb-6">
          No project evidence is linked to your declared competencies yet. Open <strong>Integrations</strong>, connect GitHub, and sync repositories against an active competency.
        </div>
      ) : null}

      {/* Trust signals summary */}
      {declaredSkills.length > 0 && (
      <>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat label="Total reviews" value={signals.total} />
        <Stat label="Context verified" value={signals.verifiedContext} />
        <Stat label="Imported" value={signals.imported} />
        <Stat label="From SIJIL form" value={signals.sijil} />
        <Stat label="High trust" value={signals.highTrust} />
        <Stat label="Pending invites" value={apiStats?.pendingInvites ?? invitations.filter((i) => i.status !== "Completed").length} />
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
                const displayHandle =
                  c.handle
                  && c.handle.replace("@", "").toLowerCase()
                    !== learnerGithub?.replace("@", "").toLowerCase()
                    ? c.handle
                    : null;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {c.name}
                        {displayHandle && (
                          <span className="text-xs text-muted-foreground">@{displayHandle}</span>
                        )}
                        <StatusBadge variant="outline">{c.role}</StatusBadge>
                        <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                          Contributor Verified
                        </StatusBadge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.email
                          ? <span className="text-foreground">{c.email}</span>
                          : "GitHub email not public — enter manually when inviting"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {reviewed ? (
                        <StatusBadge variant="info"><MessageSquare className="h-3 w-3" /> Reviewed</StatusBadge>
                      ) : invited ? (
                        <>
                          <StatusBadge variant="warning"><Mail className="h-3 w-3" /> Invite sent</StatusBadge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => openResendInvite(c)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />Resend
                          </Button>
                        </>
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
                <div className="p-4 text-sm text-muted-foreground">
                  No contributors found for this project.
                </div>
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
                      const contributor = selectedProject.contributors.find((c) => c.id === i.contributorId);
                      if (contributor && i.status !== "Completed") {
                        openResendInvite(contributor);
                        return;
                      }
                      const ctx = contextRequests.find((r) => r.id === i.id);
                      const link = i.reviewLink
                        ?? (ctx
                          ? `${window.location.origin}/review/request/${ctx.token}`
                          : i.token
                            ? `${window.location.origin}/review/invite/${i.token}`
                            : `${window.location.origin}/review/${i.id}`);
                      navigator.clipboard.writeText(link);
                      toast({ title: "Link copied", description: link });
                    }}>
                      {i.status === "Completed" ? (
                        <><Copy className="h-3 w-3 mr-1" />Copy link</>
                      ) : (
                        <><RefreshCw className="h-3 w-3 mr-1" />Resend</>
                      )}
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
                          {c.email ?? "GitHub email not public"} · project: {selectedProject.name}
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
                        {row.status === "Invite Sent" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => openResendInvite(c)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />Resend
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
      </>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {inviteResend ? "Resend review invitation" : "Invite contributor to review"}
            </DialogTitle>
          </DialogHeader>
          {selectedProject && inviteContrib && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {inviteResend ? (
                  <>Resend the secure review link to <span className="font-medium text-foreground">{inviteContrib.name}</span>. The recipient cannot be changed.</>
                ) : (
                  <>You are inviting verified contributor <span className="font-medium text-foreground">{inviteContrib.name}</span> from <span className="font-medium text-foreground">{selectedProject.name}</span>. They must verify their invited email or GitHub username before submitting.</>
                )}
              </p>
              {selectedReviewer && (
                <div>
                  <Label>Reviewer</Label>
                  <div className="mt-1.5 rounded-md border p-2 bg-muted/30">
                    <div className="font-medium">{selectedReviewer.name}</div>
                    {selectedReviewer.githubUsername ? (
                      <p className="text-xs text-muted-foreground">@{selectedReviewer.githubUsername}</p>
                    ) : contactEmailForDisplay(inviteEmail) ? (
                      <p className="text-xs text-muted-foreground">{inviteEmail.trim()}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Enter contact email below</p>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">{selectedReviewer.role} · Contributor Verified</div>
                  </div>
                </div>
              )}
              <div>
                <Label>Contact email</Label>
                <Input
                  className="mt-1.5"
                  value={inviteContrib.email ?? inviteEmail}
                  readOnly={Boolean(inviteContrib.email) || inviteResend}
                  onChange={(e) => {
                    if (!inviteContrib.email && !inviteResend) {
                      setInviteEmail(e.target.value);
                    }
                  }}
                  placeholder="contributor@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {inviteContrib.email || inviteResend
                    ? "This invite is locked to the verified contributor and cannot be redirected to another person."
                    : "Enter this contributor's own contact email once. It will be locked for future resends and checked again when they submit the review."}
                </p>
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
                  <div className="flex items-center gap-1 font-medium text-success">
                    <LinkIcon className="h-3 w-3" /> Secure review link ready
                  </div>
                  <div className="mt-1 mono break-all">{generatedLink}</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This link is secure and can only be used by the invited contributor after identity verification.
                  </p>
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
            {!generatedLink && (
              <Button onClick={() => void sendInvite()}>
                <Mail className="h-4 w-4 mr-1.5" />
                {inviteResend ? "Resend invitation email" : "Create secure invitation"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export function ReviewCard({ r }: { r: PeerReview }) {
  const originLabel = r.imported ? r.origin : (r.origin === "SIJIL Form Review" ? r.origin : "SIJIL Form Review");
  const projectLabel = r.projectName || "GitHub project";
  const skillLabel = r.skill || "Declared competency";

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
              : <StatusBadge variant="info">{originLabel}</StatusBadge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Skill: <span className="font-medium text-foreground">{skillLabel}</span>
            {" · "}Project: <span className="font-medium text-foreground">{projectLabel}</span>
            {r.evidenceLabel && r.evidenceLabel !== projectLabel && (
              <> · Evidence: <span className="font-medium text-foreground">{r.evidenceLabel}</span></>
            )}
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
            <StatusBadge variant={
              r.recommendation === "Recommended" || r.recommendation === "Support"
                ? "verified"
                : "warning"
            }>
              Decision: {r.recommendation}
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
      <div className="text-[11px] text-muted-foreground mt-2">{formatPeerReviewDate(r.date)}</div>
    </div>
  );
}

function contactEmailForDisplay(email: string): boolean {
  return Boolean(email.trim());
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

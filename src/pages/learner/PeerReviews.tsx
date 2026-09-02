import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Mail, Copy, Link as LinkIcon, ExternalLink } from "lucide-react";
import {
  computeTrustSignals,
  type PeerReview, type ProjectContributor,
  type ReviewInvitation,
} from "@/lib/sijil-data";
import { useAuth } from "@/hooks/useAuth";
import { useDeclaredSkills, useLearnerProfile } from "@/hooks/useLearnerData";
import { shortDid } from "@/components/learner/ProfilePagePanels";
import {
  PeerReviewsBreadcrumbBar,
  PeerReviewsHero,
  PeerReviewsStatsGrid,
  PeerReviewNextAction,
  PeerReviewsEmptySkills,
  PeerReviewsEmptyProjects,
  PeerReviewProjectToolbar,
  ReviewFeedTabs,
  ReviewFeedToolbar,
  PeerReviewFeed,
  PeerReviewsFooter,
  type ReviewFeedFilter,
} from "@/components/peer-reviews/PeerReviewsPagePanels";
import { PeerReviewContributorsBoard } from "@/components/peer-reviews/PeerReviewContributorsBoard";
import { PeerReviewInsightsPanel } from "@/components/peer-reviews/PeerReviewsCharts";
import {
  coverageFromRows,
  filterContributorRows,
  filterReviews,
  isStaleInvite,
  nextAction,
  reviewsByWeek,
  sourceMix,
  type ContributorViewFilter,
  type ReviewSort,
  type TrustFilter,
} from "@/lib/peer-review-insights";
import { fetchWalletCompetencyRecords, type WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import {
  loadPeerReviewPageData,
  buildContributorRows,
  contextRequestToInvitation,
  sendPeerReviewInvite,
  type PeerReviewProject,
  type ContextReviewRequestDisplay,
} from "@/lib/db/peer-review-page";
import { fetchGitHubPrReviewsForUser, type GitHubPrReviewRecord } from "@/lib/github-pr-reviews";
import {
  importExternalReviewsApi,
} from "@/services/api/reviews.api";
import {
  createPeerReviewInviteApi,
  getPeerReviewStatsApi,
  getPeerReviewContributorsApi,
  resendPeerReviewInvitationApi,
  type PeerReviewStatsApi,
} from "@/services/api/peer-review.api";
import { isApiEnabled } from "@/services/api/client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type InviteReviewer = {
  id?: string;
  name: string;
  githubUsername: string | null;
  role: ProjectContributor["role"];
};

/** Contributor GitHub login only — never the repo owner / learner login. */
function mapGitHubPrReviewToDisplay(
  review: GitHubPrReviewRecord,
  skill = "Declared competency",
): PeerReview & Record<string, unknown> {
  return {
    id: review.id,
    reviewerName: review.reviewer_name,
    reviewer_name: review.reviewer_name,
    reviewerRole: review.reviewer_role,
    reviewer_role: review.reviewer_role,
    comment: review.review_text,
    review_text: review.review_text,
    source: review.source,
    skill,
    date: review.created_at,
    created_at: review.created_at,
    repository_name: review.repository_name,
    pull_request_number: review.pull_request_number,
    pull_request_title: review.pull_request_title,
    projectName: review.repository_name,
    evidenceLabel: `${review.repository_name} — PR #${review.pull_request_number}`,
    imported: true,
    origin: "GitHub PR",
    trustWeight: "Medium Trust",
    contextStatus: "Context Verified",
    contributorVerification: "Contributor Verified",
  };
}

function mergeUniqueReviews(
  ...groups: Array<Array<PeerReview | (PeerReview & Record<string, unknown>)>>
): PeerReview[] {
  const seen = new Set<string>();
  const merged: PeerReview[] = [];
  for (const group of groups) {
    for (const review of group) {
      const id = String(review.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(review);
    }
  }
  return merged;
}

function mapWalletRecordsToReviews(records: WalletCompetencyRecordView[]): PeerReview[] {
  return records.flatMap((record) => [
    ...(record.evidencePackage?.teacherFeedback ?? []).map((feedback: Record<string, unknown>, index: number) => ({
      id: `teacher-${feedback.id ?? feedback.evidence_record_id ?? feedback.moodle_assignment_id ?? index}`,
      reviewer_name: "Teacher",
      reviewer_role: "LMS",
      review_text:
        feedback.feedback_text
        ?? feedback.feedback
        ?? "Teacher feedback",
      source: "LMS",
      skill: record.competencyName,
      created_at:
        feedback.reviewed_at
        ?? feedback.synced_at
        ?? new Date().toISOString(),
    })),
    ...(record.evidencePackage?.github?.reviews ?? []).map((review: Record<string, unknown>, index: number) => ({
      id: `github-wallet-${review.id ?? index}`,
      reviewer_name:
        review.comment_author
        ?? review.author
        ?? review.reviewer_name
        ?? "GitHub Reviewer",
      reviewer_role:
        review.pull_request_number != null || review.pull_request_title != null
          ? "GitHub PR Review"
          : "GitHub Review",
      review_text:
        review.comment_body
        ?? review.body
        ?? review.comment
        ?? review.review_text
        ?? "GitHub review",
      source: "GitHub",
      skill: record.competencyName,
      repository_name: review.repository_name ?? review.repo_name,
      pull_request_number: review.pull_request_number ?? review.pr_number,
      pull_request_title: review.pull_request_title ?? review.pr_title,
      created_at:
        review.comment_created_at
        ?? review.created_at
        ?? new Date().toISOString(),
    })),
  ]) as PeerReview[];
}

type PeerReviewPageCache = {
  userId: string;
  at: number;
  projects: PeerReviewProject[];
  reviews: PeerReview[];
  legacyInvitations: ReviewInvitation[];
  contextRequests: ContextReviewRequestDisplay[];
  apiStats: PeerReviewStatsApi | null;
  learnerGithub: string | null;
};

const PAGE_CACHE_TTL_MS = 60_000;
let peerReviewPageCache: PeerReviewPageCache | null = null;
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills: declaredSkills, loading: skillsLoading } = useDeclaredSkills();
  const didShort = profile?.did ? shortDid(profile.did) : undefined;
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<PeerReviewProject[]>([]);
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [legacyInvitations, setLegacyInvitations] = useState<ReviewInvitation[]>([]);
  const [contextRequests, setContextRequests] = useState<ContextReviewRequestDisplay[]>([]);

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
  const [reviewFilter, setReviewFilter] = useState<ReviewFeedFilter>("all");
  const [sourceName, setSourceName] = useState("all");
  const [trustFilter, setTrustFilter] = useState<TrustFilter>("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");
  const [contributorFilter, setContributorFilter] = useState<ContributorViewFilter>("all");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [githubSyncing, setGithubSyncing] = useState(false);
  const loadGenRef = useRef(0);
  const skillKey = declaredSkills.map((skill) => skill.id).join("|");

  const applyPageData = useCallback((
    data: {
      projects: PeerReviewProject[];
      reviews: PeerReview[];
      legacyInvitations: ReviewInvitation[];
      contextRequests: ContextReviewRequestDisplay[];
    },
    stats: PeerReviewStatsApi | null,
    extraReviews: PeerReview[] = [],
  ) => {
    const merged = mergeUniqueReviews(data.reviews, extraReviews);
    setProjects(data.projects);
    setReviews(merged);
    setLegacyInvitations(data.legacyInvitations);
    setContextRequests(data.contextRequests);
    if (stats) setApiStats(stats);
    setSelectedProjectId((current) => current || data.projects[0]?.id || "");
    setSkillForProject((current) =>
      current || data.projects[0]?.linkedSkills[0] || declaredSkills[0]?.name || "",
    );
    return merged;
  }, [declaredSkills]);

  const reload = useCallback(async (opts?: { silent?: boolean; skipGithub?: boolean }) => {
    if (!user?.id) return;
    const gen = ++loadGenRef.current;
    const userId = user.id;

    const cached = peerReviewPageCache;
    const cacheHit = cached
      && cached.userId === userId
      && Date.now() - cached.at < PAGE_CACHE_TTL_MS;

    if (cacheHit) {
      applyPageData(
        {
          projects: cached.projects,
          reviews: cached.reviews,
          legacyInvitations: cached.legacyInvitations,
          contextRequests: cached.contextRequests,
        },
        cached.apiStats,
      );
      setLearnerGithub(cached.learnerGithub);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }

    try {
      const [data, stats, evidenceReviews, githubConn] = await Promise.all([
        loadPeerReviewPageData(userId),
        isApiEnabled() ? getPeerReviewStatsApi() : Promise.resolve(null),
        fetchWalletCompetencyRecords(userId),
        supabase
          .from("github_connections")
          .select("github_username")
          .eq("user_id", userId)
          .maybeSingle()
          .then(({ data: row }) => row?.github_username ?? null),
      ]);
      if (gen !== loadGenRef.current) return;

      const walletReviews = mapWalletRecordsToReviews(evidenceReviews);
      const merged = applyPageData(data, stats, walletReviews);
      setLearnerGithub(githubConn);
      setLoading(false);

      peerReviewPageCache = {
        userId,
        at: Date.now(),
        projects: data.projects,
        reviews: merged,
        legacyInvitations: data.legacyInvitations,
        contextRequests: data.contextRequests,
        apiStats: stats,
        learnerGithub: githubConn,
      };

      if (!opts?.skipGithub) {
        setGithubSyncing(true);
        void fetchGitHubPrReviewsForUser(userId, { maxRepos: 4, maxPullsPerRepo: 5, linkedOnly: true })
          .then((githubPrResult) => {
            if (gen !== loadGenRef.current) return;
            if (!githubPrResult.reviews.length) return;
            const githubPrReviews = githubPrResult.reviews.map((review) => {
              const linkedProject = data.projects.find(
                (project) => project.name === review.repository_name
                  || project.url?.includes(review.repository_name),
              );
              return mapGitHubPrReviewToDisplay(
                review,
                linkedProject?.linkedSkills[0] ?? declaredSkills[0]?.name ?? "Declared competency",
              );
            });
            setReviews((prev) => {
              const next = mergeUniqueReviews(prev, githubPrReviews);
              if (peerReviewPageCache?.userId === userId) {
                peerReviewPageCache = { ...peerReviewPageCache, reviews: next, at: Date.now() };
              }
              return next;
            });
          })
          .catch(() => undefined)
          .finally(() => {
            if (gen === loadGenRef.current) setGithubSyncing(false);
          });
      }
    } catch {
      if (gen !== loadGenRef.current) return;
      setLoading(false);
      throw new Error("load failed");
    }
  }, [applyPageData, declaredSkills, user?.id]);

  useEffect(() => {
    if (!user?.id || skillsLoading) return;
    void reload().catch(() => {
      toast({
        title: "Could not load reviews",
        description: "Check GitHub sync on Integrations and try refreshing.",
        variant: "destructive",
      });
    });
  }, [user?.id, skillsLoading, skillKey, reload]);

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

  const visibleContributorRows = useMemo(
    () => filterContributorRows(contributorRows, contributorFilter),
    [contributorRows, contributorFilter],
  );

  const coverage = useMemo(() => coverageFromRows(contributorRows), [contributorRows]);
  const insightAction = useMemo(
    () => nextAction(contributorRows, reviews, invitations),
    [contributorRows, reviews, invitations],
  );
  const sourceSlices = useMemo(() => sourceMix(reviews), [reviews]);
  const weekPoints = useMemo(() => reviewsByWeek(reviews), [reviews]);
  const [focusedReviewId, setFocusedReviewId] = useState<string | null>(null);

  const visibleReviews = useMemo(
    () => filterReviews(reviews, reviewFilter, trustFilter, reviewSearch, reviewSort, sourceName),
    [reviews, reviewFilter, trustFilter, reviewSearch, reviewSort, sourceName],
  );

  const pendingInviteCount = apiStats?.pendingInvites
    ?? invitations.filter((invitation) => invitation.status !== "Completed").length;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResend, setInviteResend] = useState(false);
  const [inviteResendId, setInviteResendId] = useState<string | null>(null);
  const [inviteResendSource, setInviteResendSource] = useState<"peer" | "request" | "legacy">("peer");
  const [inviteContrib, setInviteContrib] = useState<ProjectContributor | null>(null);
  const [inviteSkill, setInviteSkill] = useState<string>(skillForProject);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [learnerGithub, setLearnerGithub] = useState<string | null>(null);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);

  const selectedReviewer = useMemo(
    () => (inviteContrib ? contributorToInviteReviewer(inviteContrib, learnerGithub) : null),
    [inviteContrib, learnerGithub],
  );

  const openInvite = (c: ProjectContributor) => {
    setInviteResend(false);
    setInviteResendId(null);
    setInviteResendSource("peer");
    setInviteContrib(c);
    setInviteSkill(skillForProject);
    setInviteEmail(c.email ?? "");
    setGeneratedLink(null);
    setInviteOpen(true);
  };

  const openResendInvite = (c: ProjectContributor, projectId?: string) => {
    const targetProjectId = projectId ?? selectedProject?.id;
    const pendingInvite = invitations.find(
      (i) => i.projectId === targetProjectId
        && i.contributorId === c.id
        && i.status !== "Completed",
    );
    setInviteResend(true);
    setInviteResendId(pendingInvite?.id ?? null);
    setInviteResendSource(pendingInvite?.recordSource ?? "peer");
    setInviteContrib(c);
    setInviteSkill(pendingInvite?.skill ?? skillForProject);
    setInviteEmail(pendingInvite?.contributorEmail ?? c.email ?? "");
    setGeneratedLink(null);
    setInviteOpen(true);
  };

  const resolveInviteSkill = (project: PeerReviewProject, skillName: string) => {
    const skillLink = project.skillLinks.find((s) => s.skillName === skillName)
      ?? project.skillLinks[0];
    const declaredSkill = declaredSkills.find((s) => s.name === skillName)
      ?? declaredSkills.find((s) => s.name === skillForProject);
    return {
      skillId: skillLink?.skillId ?? declaredSkill?.id ?? null,
      skillName: skillLink?.skillName ?? declaredSkill?.name ?? skillName,
    };
  };

  const resolveInvitationLink = (invitation: ReviewInvitation) => {
    if (invitation.reviewLink) return invitation.reviewLink;
    const ctx = contextRequests.find((r) => r.id === invitation.id);
    const token = invitation.token ?? ctx?.token;
    if (token) return `${window.location.origin}/review/request/${token}`;
    return `${window.location.origin}/review/${invitation.id}`;
  };

  const resendInvitationFromList = async (invitation: ReviewInvitation) => {
    const source = invitation.recordSource ?? "peer";
    if (source === "legacy") {
      const link = resolveInvitationLink(invitation);
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link copied",
        description: "Older invitations must be shared manually. Link copied to clipboard.",
      });
      return;
    }

    let apiError = "";
    const result = await resendPeerReviewInvitationApi(invitation.id, source, (msg) => {
      apiError = msg;
    });

    if (!result) {
      toast({
        title: "Resend failed",
        description: apiError.includes("Failed to fetch") || apiError.includes("unavailable")
          ? "Backend is offline. Start it with npm run dev in backend/ for email delivery, or ensure VITE_API_BASE_URL is correct."
          : apiError || "Could not resend the review invitation.",
        variant: "destructive",
      });
      return;
    }

    await reload({ silent: true, skipGithub: true });
    if (result.viaFallback) {
      await navigator.clipboard.writeText(result.reviewLink);
      toast({
        title: "Review link refreshed",
        description: `Backend is offline — link copied to clipboard. Share it with ${invitation.contributorEmail} manually, or start the backend to send email.`,
      });
      return;
    }

    toast({
      title: "Invitation resent",
      description: `Review link emailed again to ${invitation.contributorEmail}.`,
    });
  };

  const quickSendInvite = async (c: ProjectContributor) => {
    if (!selectedProject || !user?.id) return;

    const email = (c.email ?? "").trim().toLowerCase();
    if (!email) {
      openInvite(c);
      return;
    }

    const { skillId, skillName } = resolveInviteSkill(selectedProject, skillForProject);
    if (!skillId) {
      toast({
        title: "Skill required",
        description: "Select a declared skill or link this repository to a skill on Integrations.",
      });
      return;
    }

    setSendingInviteId(c.id);
    try {
      if (isApiEnabled()) {
        let apiError = "";
        const result = await createPeerReviewInviteApi({
          projectId: selectedProject.id,
          contributorId: c.id,
          skillId,
          contributorEmail: email,
        }, (msg) => { apiError = msg; });

        if (result?.alreadyReviewed) {
          toast({
            title: "Review already exists",
            description: `${c.name} has already submitted a review for this project.`,
          });
          return;
        }

        if (result) {
          await reload({ silent: true, skipGithub: true });
          toast({ title: "Review invitation sent successfully" });
          return;
        }

        if (apiError) {
          toast({
            title: "Request failed",
            description: apiError,
            variant: "destructive",
          });
        }
      }

      const result = await sendPeerReviewInvite({
        userId: user.id,
        project: selectedProject,
        contributor: c,
        skillName,
        skillId,
        contributorEmail: email,
      });

      if (!result.ok) {
        toast({
          title: "Could not send invitation",
          description: result.error === "email_required"
            ? "Contributor email is required before sending an invite."
            : result.error ?? "Try again later.",
          variant: "destructive",
        });
        return;
      }

      if (result.invite) {
        setContextRequests((prev) => [
          result.invite!,
          ...prev.filter((item) => item.id !== result.invite!.id),
        ]);
      }
      toast({ title: "Review invitation sent successfully" });
    } finally {
      setSendingInviteId(null);
    }
  };

  const sendInvite = async () => {
    if (!selectedProject) return;
    if (!inviteContrib) return;
    if (!inviteEmail.trim()) {
      toast({ title: "Email required", description: "We need a contact email to send the review invitation." });
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
    const { skillId, skillName: inviteSkillName } = resolveInviteSkill(selectedProject, inviteSkill);

    if (inviteResend && inviteResendId) {
      let apiError = "";
      const result = await resendPeerReviewInvitationApi(
        inviteResendId,
        inviteResendSource,
        (msg) => { apiError = msg; },
      );

      if (!result) {
        toast({
          title: "Resend failed",
          description: apiError.includes("Failed to fetch") || apiError.includes("unavailable")
            ? "Backend is offline. Start it with npm run dev in backend/ for email delivery."
            : apiError || "Could not resend the review invitation.",
          variant: "destructive",
        });
        return;
      }

      setGeneratedLink(result.reviewLink);
      await reload({ silent: true, skipGithub: true });
      if (result.viaFallback) {
        toast({
          title: "Review link refreshed",
          description: `Backend is offline — share this link with ${normalizedEmail} manually, or start the backend to send email.`,
        });
        return;
      }

      toast({
        title: "Invitation resent",
        description: `Review link emailed again to ${normalizedEmail}.`,
      });
      return;
    }

    if (!skillId) {
      toast({
        title: "Skill required",
        description: "Select a declared skill or link this repository to a skill on Integrations.",
      });
      return;
    }

    setSendingInviteId(contributorId);
    try {
      if (isApiEnabled()) {
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
        await reload({ silent: true, skipGithub: true });
        toast({
          title: inviteResend
            ? "Invitation resent"
            : result.status === "already_invited"
              ? "Invitation already pending"
              : "Review invitation sent successfully",
          description: inviteResend
            ? `Review link emailed again to ${normalizedEmail}.`
            : result.status === "already_invited"
              ? `An invitation is already pending for ${normalizedEmail}. Use Resend if you need to email the link again.`
              : `Review invitation emailed to ${normalizedEmail} for ${inviteSkillName} on ${selectedProject.name}.`,
        });
        return;
      }

      const result = await sendPeerReviewInvite({
        userId: user!.id,
        project: selectedProject,
        contributor: inviteContrib,
        skillName: inviteSkillName,
        skillId,
        contributorEmail: normalizedEmail,
      });

      if (!result.ok || !result.invite) {
        toast({
          title: "Could not send invitation",
          description: result.error ?? "Try again later.",
          variant: "destructive",
        });
        return;
      }

      setGeneratedLink(`${window.location.origin}/review/request/${result.invite.token}`);
      setContextRequests((prev) => [
        result.invite!,
        ...prev.filter((item) => item.id !== result.invite!.id),
      ]);
      toast({ title: "Review invitation sent successfully" });
    } finally {
      setSendingInviteId(null);
    }
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

    await reload({ silent: true, skipGithub: true });
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

  const inviteRemaining = async () => {
    const pending = contributorRows.filter((row) => row.status === "Review Pending");
    const needsEmail = pending.find((row) => !row.contributor.email);
    if (needsEmail) {
      openInvite(needsEmail.contributor);
      return;
    }
    setBulkBusy(true);
    try {
      for (const row of pending) {
        await quickSendInvite(row.contributor);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const resendStale = async () => {
    const staleRows = contributorRows.filter(
      (row) => row.status === "Invite Sent" && isStaleInvite(row.lastInviteAt),
    );
    if (staleRows[0]) {
      openResendInvite(staleRows[0].contributor);
      return;
    }
    const staleInvite = invitations.find((invitation) => invitation.status !== "Completed");
    if (staleInvite) await resendInvitationFromList(staleInvite);
  };

  const skillOptions = selectedProject?.linkedSkills.length
    ? selectedProject.linkedSkills
    : declaredSkills.map((skill) => skill.name);

  const scrollToReview = (reviewId: string) => {
    setFocusedReviewId(reviewId);
    window.setTimeout(() => {
      document.getElementById(`review-${reviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <PeerReviewsBreadcrumbBar didShort={didShort} />

      {loading ? (
        <div className="mb-6"><PageSkeleton rows={4} /></div>
      ) : declaredSkills.length === 0 ? (
        <PeerReviewsEmptySkills onGoProfile={() => navigate("/learner/my-profile")} />
      ) : projects.length === 0 ? (
        <PeerReviewsEmptyProjects onGoIntegrations={() => navigate("/learner/integrations")} />
      ) : (
        <>
          <PeerReviewsHero
            onImport={() => void importExisting()}
            importDisabled={!selectedProject || loading}
            syncing={githubSyncing}
          />
          <PeerReviewsStatsGrid
            total={signals.total}
            verifiedContext={signals.verifiedContext}
            highTrust={signals.highTrust}
            pending={pendingInviteCount}
            activeTrust={trustFilter}
            onSelectTrust={setTrustFilter}
            onFocusInvites={() => {
              setContributorFilter("invited");
              document.getElementById("peer-contributors")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <PeerReviewNextAction
            action={insightAction}
            busy={bulkBusy}
            onInviteRemaining={() => void inviteRemaining()}
            onResendStale={() => void resendStale()}
            onImport={() => void importExisting()}
          />
          <PeerReviewInsightsPanel
            points={weekPoints}
            slices={sourceSlices}
            activeSource={sourceName}
            onSelectSource={(name) => {
              setSourceName(name);
              if (name === "all") setReviewFilter("all");
              else if (name === "SIJIL") setReviewFilter("sijil");
              else setReviewFilter("imported");
            }}
          />
          <PeerReviewProjectToolbar
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              const next = projects.find((project) => project.id === id);
              if (next) setSkillForProject(next.linkedSkills[0] ?? skillForProject);
            }}
            skillValue={skillForProject}
            onSkillChange={setSkillForProject}
            skillOptions={skillOptions}
            selectedProject={selectedProject}
          />

          <div className="space-y-6">
            <PeerReviewContributorsBoard
              rows={contributorRows}
              visibleRows={visibleContributorRows}
              coverage={coverage}
              filter={contributorFilter}
              onFilter={setContributorFilter}
              learnerGithub={learnerGithub}
              sendingId={sendingInviteId}
              onViewReview={scrollToReview}
              onResend={openResendInvite}
              onInvite={(contributor) => void quickSendInvite(contributor)}
            />

            <PeerReviewFeed
              reviews={visibleReviews}
              focusId={focusedReviewId}
              emptyTitle={reviews.length === 0 ? "No reviews yet" : "No matches"}
              emptyDescription={reviews.length === 0
                ? "Invite a contributor or import from GitHub."
                : "Try a different search or filter."}
              header={(
                <div className="flex flex-col gap-3 border-b border-[#e2e8f0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm font-semibold text-[#023E8A]">
                    Reviews
                    <span className="ml-2 font-normal tabular-nums text-[#94a3b8]">{visibleReviews.length}</span>
                    {sourceName !== "all" && (
                      <span className="ml-2 rounded-full bg-[#e8eef7] px-2 py-0.5 text-[10px] font-medium text-[#023E8A]">
                        {sourceName}
                      </span>
                    )}
                  </h2>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <ReviewFeedToolbar
                      search={reviewSearch}
                      onSearch={setReviewSearch}
                      sort={reviewSort}
                      onSort={setReviewSort}
                    />
                    <ReviewFeedTabs
                      value={reviewFilter}
                      onChange={(value) => {
                        setReviewFilter(value);
                        setSourceName("all");
                      }}
                      counts={{
                        all: reviews.length,
                        imported: reviews.filter((review) => review.imported).length,
                        sijil: reviews.filter((review) => !review.imported).length,
                      }}
                    />
                  </div>
                </div>
              )}
            />
          </div>
        </>
      )}

      <PeerReviewsFooter />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="pr-invite-dialog gap-0 p-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-[#e2e8f0] px-6 py-4">
            <DialogTitle className="text-[#023E8A]">
              {inviteResend ? "Resend invite" : "Invite reviewer"}
            </DialogTitle>
          </DialogHeader>
          {selectedProject && inviteContrib && (
            <div className="space-y-4 px-6 py-4 text-sm">
              <p className="text-[#64748b]">
                {inviteResend ? (
                  <>Resend to <span className="font-medium text-[#0f172a]">{inviteContrib.name}</span>.</>
                ) : (
                  <>Invite <span className="font-medium text-[#0f172a]">{inviteContrib.name}</span> from <span className="font-medium text-[#0f172a]">{selectedProject.name}</span>.</>
                )}
              </p>
              {selectedReviewer && (
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Reviewer</Label>
                  <div className="mt-1.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                    <div className="font-medium text-[#0f172a]">{selectedReviewer.name}</div>
                    {selectedReviewer.githubUsername ? (
                      <p className="text-xs text-[#64748b]">@{selectedReviewer.githubUsername}</p>
                    ) : inviteEmail.trim() ? (
                      <p className="text-xs text-[#64748b]">{inviteEmail.trim()}</p>
                    ) : (
                      <p className="text-xs text-[#64748b]">Enter contact email below</p>
                    )}
                    <div className="mt-0.5 text-xs text-[#94a3b8]">{selectedReviewer.role}</div>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Contact email</Label>
                <Input
                  className="mt-1.5 rounded-xl border-[#e2e8f0]"
                  value={inviteContrib.email ?? inviteEmail}
                  readOnly={Boolean(inviteContrib.email) || inviteResend}
                  onChange={(e) => {
                    if (!inviteContrib.email && !inviteResend) {
                      setInviteEmail(e.target.value);
                    }
                  }}
                  placeholder="contributor@example.com"
                />
                <p className="mt-1 text-xs text-[#94a3b8]">
                  {inviteContrib.email || inviteResend
                    ? "Locked to this contributor."
                    : "Enter their email. It stays locked after send."}
                </p>
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Skill</Label>
                <Select value={inviteSkill} onValueChange={setInviteSkill}>
                  <SelectTrigger className="mt-1.5 rounded-xl border-[#e2e8f0]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {skillOptions.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {generatedLink && (
                <div className="rounded-xl border border-[#bbf7d0] bg-[#ecfdf5] p-3 text-xs">
                  <div className="flex items-center gap-1 font-semibold text-[#059669]">
                    <LinkIcon className="h-3 w-3" /> Review link ready
                  </div>
                  <div className="mt-1 break-all font-mono text-[#334155]">{generatedLink}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" className="rounded-lg border-[#e2e8f0]" onClick={() => { navigator.clipboard.writeText(generatedLink); toast({ title: "Link copied" }); }}>
                      <Copy className="mr-1 h-3 w-3" />Copy
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-lg border-[#e2e8f0]" onClick={() => window.open(generatedLink, "_blank")}>
                      <ExternalLink className="mr-1 h-3 w-3" />Open form
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="border-t border-[#e2e8f0] px-6 py-4">
            <Button variant="outline" className="rounded-xl border-[#e2e8f0]" onClick={() => setInviteOpen(false)}>Close</Button>
            {!generatedLink && (
              <Button className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => void sendInvite()} disabled={Boolean(sendingInviteId)}>
                <Mail className="mr-1.5 h-4 w-4" />
                {inviteResend ? "Resend email" : "Send invite"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LearnerWorkspaceShell>
  );
}

export { PeerReviewCard as ReviewCard } from "@/components/peer-reviews/PeerReviewsPagePanels";

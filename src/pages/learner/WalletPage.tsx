import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useCredentials, useLearnerProfile } from "@/hooks/useLearnerData";
import {
  fetchWalletCompetencyRecords,
  type WalletCompetencyRecordView,
} from "@/lib/db/wallet-competency-records";
import type {
  WalletAttemptHistoryItem,
  WalletEvidenceSummary,
  WalletShareFieldId,
} from "@/lib/wallet-competency-shared";
import { fetchGitHubConnection } from "@/lib/github-integration";
import { fetchMoodleConnection } from "@/lib/moodle-integration";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardList,
  Github,
  GraduationCap,
  MessageSquare,
} from "lucide-react";
import {
  getWalletCompetenciesApi,
  getWalletCompetencyApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
  type WalletShareRecordView,
} from "@/services/api/wallet.api";
import {
  AuditLedgerCard,
  CompetencyPackageCard,
  ConnectedSourcesCard,
  EvidenceInspectorCard,
  OneClickShareCard,
  WalletEmptyState,
  WalletRefreshBar,
  WalletStepper,
  WalletWorkspaceHeader,
  numberValue,
  textValue,
  type ConnectedSourceRow,
  type GithubPackageStats,
  type InspectorSource,
  type LedgerEvent,
  type LmsCourseRow,
  type ShareToggle,
} from "@/components/wallet/WalletWorkspacePanels";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString();
}

function formatOptional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function latestAttempt(summary: WalletEvidenceSummary): WalletAttemptHistoryItem | null {
  return summary.practicalTask.latestAttempt
    ?? (Array.isArray(summary.practicalTask.attemptHistory) ? summary.practicalTask.attemptHistory[0] : null)
    ?? null;
}

function resolveEvidencePackage(record: WalletCompetencyRecordView): WalletEvidenceSummary {
  return record.evidencePackage;
}

function asEvidenceArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function startOfWeek(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function buildCommitSeries(
  repos: Record<string, unknown>[],
  activities: Record<string, unknown>[],
): GithubPackageStats["commitSeries"] {
  const datedCommits = activities
    .filter((row) => {
      const type = textValue(row.activity_type).toLowerCase();
      return type === "commit" || Boolean(textValue(row.commit_hash));
    })
    .map((row) => new Date(textValue(row.occurred_at) || textValue(row.synced_at)))
    .filter((date) => Number.isFinite(date.getTime()));

  if (datedCommits.length > 0) {
    const buckets = new Map<string, { label: string; commits: number }>();
    for (let offset = 7; offset >= 0; offset -= 1) {
      const week = startOfWeek(new Date(Date.now() - offset * 7 * 24 * 60 * 60 * 1000));
      buckets.set(week.toISOString(), {
        label: week.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        commits: 0,
      });
    }
    for (const date of datedCommits) {
      const key = startOfWeek(date).toISOString();
      const bucket = buckets.get(key);
      if (bucket) bucket.commits += 1;
    }
    const series = [...buckets.values()];
    if (series.some((point) => point.commits > 0)) return series;
  }

  return repos
    .map((row) => ({
      label: (textValue(row.repo_name) || textValue(row.full_name).split("/").pop() || "Repo").slice(0, 10),
      commits: numberValue(row.commit_count) ?? 0,
    }))
    .filter((point) => point.commits > 0)
    .slice(0, 8);
}

function buildGithubStats(summary: WalletEvidenceSummary): GithubPackageStats {
  const repos = asEvidenceArray(summary.github.repos);
  const activities = asEvidenceArray(summary.github.activities);
  const languages = [...new Set(
    repos.map((row) => textValue(row.primary_language) || textValue(row.language)).filter(Boolean),
  )];
  const datedCommitCount = activities.filter((row) => {
    const type = textValue(row.activity_type).toLowerCase();
    return type === "commit" || Boolean(textValue(row.commit_hash));
  }).length;
  const commits = repos.reduce((total, row) => total + (numberValue(row.commit_count) ?? 0), 0) || datedCommitCount;
  const pullRequests = activities.filter((row) =>
    textValue(row.activity_type).toLowerCase().includes("pull"),
  ).length;

  return {
    repos: repos.length,
    commits,
    activities: activities.length,
    pullRequests,
    languages,
    commitSeries: buildCommitSeries(repos, activities),
  };
}

function buildLmsRows(summary: WalletEvidenceSummary): LmsCourseRow[] {
  const courses = asEvidenceArray(summary.lms.courses);
  const assignments = asEvidenceArray(summary.lms.assignments);
  const evidence = asEvidenceArray(summary.lms.evidence);
  const grades = asEvidenceArray(summary.lms.grades);

  if (courses.length > 0) {
    return courses.map((course, index) => {
      const courseId = textValue(course.moodle_course_id);
      const courseAssignments = assignments.filter((row) =>
        textValue(row.moodle_course_id) === courseId,
      );
      const courseGrades = grades.filter((row) => textValue(row.moodle_course_id) === courseId);
      const scoreValues = [...courseAssignments, ...courseGrades]
        .map((row) => numberValue(row.grade))
        .filter((value): value is number => value != null);
      const maxValues = [...courseAssignments, ...courseGrades]
        .map((row) => numberValue(row.grade_max))
        .filter((value): value is number => value != null);
      const avg = scoreValues.length
        ? Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length)
        : null;
      const max = maxValues.length
        ? Math.round(maxValues.reduce((sum, value) => sum + value, 0) / maxValues.length)
        : null;
      const percent = avg != null && max ? Math.round((avg / max) * 100) : avg;
      return {
        id: courseId || `course-${index}`,
        name: textValue(course.fullname) || textValue(course.shortname) || textValue(course.course_name) || "LMS course",
        assignments: courseAssignments.length || courseGrades.length,
        scoreLabel: avg != null && max != null ? `${avg} / ${max}` : avg != null ? `${avg}` : "—",
        scorePercent: percent,
      };
    });
  }

  const fallback = [...evidence, ...assignments];
  if (fallback.length === 0) return [];
  const avg = fallback
    .map((row) => numberValue(row.grade))
    .filter((value): value is number => value != null);
  const score = avg.length ? Math.round(avg.reduce((sum, value) => sum + value, 0) / avg.length) : null;
  return [{
    id: "lms-linked",
    name: textValue(fallback[0].course_name) || "Linked LMS evidence",
    assignments: fallback.length,
    scoreLabel: score != null ? String(score) : "Linked",
    scorePercent: score,
  }];
}

function buildLedgerEvents(summary: WalletEvidenceSummary): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const row of asEvidenceArray(summary.github.activities)) {
    const hash = textValue(row.commit_hash) || textValue(row.id);
    const at = textValue(row.occurred_at) || textValue(row.synced_at);
    if (!hash || !at) continue;
    events.push({
      id: `gh-${hash}`,
      at,
      hash,
      source: textValue(row.activity_type) || "github",
    });
  }

  for (const row of asEvidenceArray(summary.github.repos)) {
    const at = textValue(row.last_updated) || textValue(row.synced_at);
    const hash = textValue(row.id) || textValue(row.full_name);
    if (!at || !hash) continue;
    events.push({ id: `repo-${hash}`, at, hash, source: "github" });
  }

  for (const row of asEvidenceArray(summary.lms.evidence)) {
    const at = textValue(row.fetched_at);
    const hash = textValue(row.id) || textValue(row.course_name);
    if (!at || !hash) continue;
    events.push({ id: `lms-${hash}`, at, hash, source: "lms" });
  }

  for (const attempt of summary.practicalTask.attemptHistory) {
    if (!attempt.submittedAt) continue;
    events.push({
      id: `task-${attempt.attemptId}`,
      at: attempt.submittedAt,
      hash: attempt.attemptId,
      source: "task",
    });
  }

  for (const row of asEvidenceArray(summary.peerReviews)) {
    const at = textValue(row.reviewed_at) || textValue(row.review_date) || textValue(row.created_at);
    const hash = textValue(row.id) || textValue(row.reviewer_name);
    if (!at || !hash) continue;
    events.push({ id: `review-${hash}`, at, hash, source: "review" });
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);
}

function ItemCard({
  title,
  meta,
  body,
  href,
}: {
  title: string;
  meta?: string | null;
  body?: string | null;
  href?: string | null;
}) {
  const content = (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="text-sm font-medium">{title}</div>
      {meta && <div className="mt-1 text-xs text-muted-foreground">{meta}</div>}
      {body && <div className="mt-2 text-xs text-muted-foreground">{body}</div>}
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  );
}

function WalletEvidenceDialog(props: {
  record: WalletCompetencyRecordView | null;
  fallbackDid: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { record, fallbackDid, open, onOpenChange } = props;
  if (!record) return null;

  const summary = resolveEvidencePackage(record);
  const githubRepos = asEvidenceArray(summary.github.repos);
  const githubActivities = asEvidenceArray(summary.github.activities);
  const lmsItems = [...asEvidenceArray(summary.lms.evidence), ...asEvidenceArray(summary.lms.assignments)];
  const peerReviews = asEvidenceArray(summary.peerReviews);
  const attempt = latestAttempt(summary);
  const attemptHistory = summary.practicalTask.attemptHistory;
  const did = summary.learner.did ?? fallbackDid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>{record.competencyName}</DialogTitle>
          <DialogDescription>Source evidence package for this competency.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-2">
          {did ? (
            <p className="break-all font-mono text-xs text-muted-foreground">DID · {did}</p>
          ) : null}
          <Tabs defaultValue="github" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="github" className="gap-1.5"><Github className="h-3.5 w-3.5" /> GitHub</TabsTrigger>
              <TabsTrigger value="lms" className="gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> LMS</TabsTrigger>
              {(attemptHistory.length > 0 || attempt) && (
                <TabsTrigger value="task" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Practical Task</TabsTrigger>
              )}
              {peerReviews.length > 0 && (
                <TabsTrigger value="reviews" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Reviews</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="github" className="mt-4 space-y-3">
              {githubRepos.length === 0 && githubActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No GitHub evidence available.</p>
              ) : (
                <>
                  {githubRepos.map((repo, index) => (
                    <ItemCard
                      key={`repo-${index}`}
                      title={textValue(repo.full_name) || textValue(repo.repo_name) || "Repository"}
                      meta={[textValue(repo.primary_language), numberValue(repo.commit_count) != null ? `${repo.commit_count} commits` : null].filter(Boolean).join(" · ")}
                      href={textValue(repo.github_url) || null}
                    />
                  ))}
                  {githubActivities.map((activity, index) => (
                    <ItemCard
                      key={`activity-${index}`}
                      title={textValue(activity.activity_title) || "GitHub activity"}
                      meta={[textValue(activity.activity_type), formatDate(textValue(activity.occurred_at))].filter(Boolean).join(" · ")}
                      href={textValue(activity.activity_url) || null}
                    />
                  ))}
                </>
              )}
            </TabsContent>
            <TabsContent value="lms" className="mt-4 space-y-3">
              {lmsItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No LMS evidence available.</p>
              ) : lmsItems.map((item, index) => (
                <ItemCard
                  key={`lms-${index}`}
                  title={textValue(item.course_name) || textValue(item.name) || "LMS evidence"}
                  meta={item.grade != null ? `Grade: ${String(item.grade)}` : null}
                  body={formatOptional(item.feedback) ?? formatOptional(item.text_preview)}
                />
              ))}
            </TabsContent>
            {(attemptHistory.length > 0 || attempt) && (
              <TabsContent value="task" className="mt-4 space-y-3">
                {attemptHistory.map((item) => (
                  <ItemCard
                    key={item.attemptId}
                    title={item.title}
                    meta={[item.status, item.scorePercent != null ? `${item.scorePercent}%` : null].filter(Boolean).join(" · ")}
                  />
                ))}
              </TabsContent>
            )}
            {peerReviews.length > 0 && (
              <TabsContent value="reviews" className="mt-4 space-y-3">
                {peerReviews.map((review, index) => (
                  <ItemCard
                    key={`peer-${index}`}
                    title={textValue(review.reviewer_name) || "Peer review"}
                    meta={textValue(review.reviewer_role) || textValue(review.source)}
                    body={textValue(review.review_text) || textValue(review.comment)}
                  />
                ))}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const { credentials } = useCredentials();
  const [records, setRecords] = useState<WalletCompetencyRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedRecord, setSelectedRecord] = useState<WalletCompetencyRecordView | null>(null);
  const [inspectorSource, setInspectorSource] = useState<InspectorSource>("github");
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubAvatarUrl, setGithubAvatarUrl] = useState<string | null>(null);
  const [githubSyncedAt, setGithubSyncedAt] = useState<string | null>(null);
  const [moodleHost, setMoodleHost] = useState<string | null>(null);
  const [moodleSyncedAt, setMoodleSyncedAt] = useState<string | null>(null);
  const [shares, setShares] = useState<WalletShareRecordView[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [enabledFields, setEnabledFields] = useState<WalletShareFieldId[]>(["competency_name"]);
  const [shareScope, setShareScope] = useState<"all" | "selected">("all");
  const [submitting, setSubmitting] = useState(false);

  const loadRecords = async () => {
    if (!user?.id) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [derivedRecords, apiRecords, github, moodle] = await Promise.all([
        fetchWalletCompetencyRecords(user.id),
        getWalletCompetenciesApi(),
        fetchGitHubConnection(user.id).catch(() => null),
        fetchMoodleConnection().catch(() => null),
      ]);
      const derivedById = new Map(derivedRecords.map((record) => [record.competencyId, record]));
      const merged = apiRecords?.length
        ? [
            ...apiRecords.map((record) => derivedById.get(record.competencyId) ?? record),
            ...derivedRecords.filter((record) => !apiRecords.some((item) => item.competencyId === record.competencyId)),
          ]
        : derivedRecords;
      setRecords(merged);
      setSelectedId((current) => current && merged.some((record) => record.competencyId === current)
        ? current
        : merged[0]?.competencyId ?? "");
      setGithubUsername(github?.github_username ?? null);
      setGithubAvatarUrl(github?.github_avatar_url ?? null);
      setGithubSyncedAt(github?.last_synced_at ?? null);
      setMoodleHost(moodle?.moodle_site_url ?? null);
      setMoodleSyncedAt(moodle?.last_synced_at ?? null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : "Could not load wallet records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [user?.id]);

  const activeRecord = records.find((record) => record.competencyId === selectedId) ?? records[0] ?? null;
  const summary = activeRecord?.evidencePackage ?? null;
  const githubStats = summary ? buildGithubStats(summary) : { repos: 0, commits: 0, activities: 0, pullRequests: 0, languages: [], commitSeries: [] };
  const lmsRows = summary ? buildLmsRows(summary) : [];
  const attempt = summary ? latestAttempt(summary) : null;
  const peerReviews = summary ? asEvidenceArray(summary.peerReviews) : [];

  useEffect(() => {
    if (!activeRecord) {
      setShares([]);
      setShareUrl(null);
      return;
    }
    let active = true;
    getWalletCompetencyApi(activeRecord.competencyId)
      .then((detail) => {
        if (!active || !detail) return;
        setShares(detail.shares);
        const latest = detail.shares.find((share) => share.shareStatus === "Active");
        if (!latest) {
          setShareUrl(null);
          setShareToken(null);
          return;
        }
        try {
          const stored = sessionStorage.getItem(`sijil.share.${latest.id}`);
          if (!stored) return;
          const parsed = JSON.parse(stored) as { token?: string; url?: string };
          if (parsed.url) setShareUrl(parsed.url);
          if (parsed.token) setShareToken(parsed.token);
        } catch {
          // ignore malformed session data
        }
      })
      .catch(() => {
        if (active) setShares([]);
      });
    return () => {
      active = false;
    };
  }, [activeRecord?.competencyId]);

  const availableSources = useMemo<InspectorSource[]>(() => {
    const next: InspectorSource[] = [];
    if (githubStats.repos > 0 || githubStats.activities > 0) next.push("github");
    if (lmsRows.length > 0) next.push("lms");
    if (attempt) next.push("task");
    if (peerReviews.length > 0) next.push("reviews");
    return next.length ? next : ["github"];
  }, [githubStats.repos, githubStats.activities, lmsRows.length, attempt, peerReviews.length]);

  useEffect(() => {
    if (!availableSources.includes(inspectorSource)) {
      setInspectorSource(availableSources[0]);
    }
  }, [availableSources, inspectorSource]);

  const connectedSources = useMemo<ConnectedSourceRow[]>(() => {
    if (!summary || !activeRecord) return [];
    return [
      {
        id: "github",
        label: "GitHub",
        detail: githubUsername
          ? `${githubUsername} · ${githubStats.repos} linked repo${githubStats.repos === 1 ? "" : "s"}`
          : githubStats.repos > 0
            ? `${githubStats.repos} linked repositories`
            : "Connect GitHub on Integrations",
        lastSync: githubSyncedAt ?? summary.evidenceTimestamps.github[0] ?? null,
        verified: githubStats.repos > 0 || githubStats.activities > 0,
        available: Boolean(githubUsername) || githubStats.repos > 0,
      },
      {
        id: "moodle",
        label: "Moodle / LMS",
        detail: moodleHost
          ? moodleHost.replace(/^https?:\/\//, "")
          : lmsRows.length > 0
            ? `${lmsRows.length} linked course${lmsRows.length === 1 ? "" : "s"}`
            : "Connect Moodle on Integrations",
        lastSync: moodleSyncedAt ?? summary.evidenceTimestamps.lms[0] ?? null,
        verified: lmsRows.length > 0,
        available: Boolean(moodleHost) || lmsRows.length > 0,
      },
      {
        id: "reviews",
        label: "Peer reviews",
        detail: peerReviews.length > 0
          ? `${peerReviews.length} review${peerReviews.length === 1 ? "" : "s"} linked`
          : "Invite reviewers from Peer Reviews",
        lastSync: summary.evidenceTimestamps.peerReviews[0] ?? null,
        verified: peerReviews.length > 0,
        available: peerReviews.length > 0,
      },
      {
        id: "task",
        label: "Practical task",
        detail: attempt
          ? `${attempt.status}${attempt.scorePercent != null ? ` · ${attempt.scorePercent}%` : ""}`
          : "Submit a task to include a result",
        lastSync: attempt?.submittedAt ?? null,
        verified: attempt?.passed === true,
        available: Boolean(attempt),
      },
      ...(profile?.linkedinUrl ? [{
        id: "linkedin",
        label: "LinkedIn",
        detail: profile.linkedinUrl,
        lastSync: null,
        verified: true,
        available: true,
      }] : []),
    ];
  }, [summary, activeRecord, githubUsername, githubSyncedAt, githubStats.repos, githubStats.activities, moodleHost, moodleSyncedAt, lmsRows.length, peerReviews.length, attempt, profile?.linkedinUrl]);

  const profilePhotoUrl = profile?.avatarUrl || githubAvatarUrl || null;

  const shareToggles = useMemo<ShareToggle[]>(() => {
    if (!activeRecord || !summary) return [];
    return [
      { id: "competency_name", label: "Competency name", enabled: enabledFields.includes("competency_name"), available: true },
      { id: "verification_status", label: "Verification status", enabled: enabledFields.includes("verification_status"), available: true },
      { id: "github_evidence", label: "GitHub evidence", enabled: enabledFields.includes("github_evidence"), available: githubStats.repos > 0 || githubStats.activities > 0 },
      { id: "lms_evidence", label: "Moodle / LMS evidence", enabled: enabledFields.includes("lms_evidence"), available: lmsRows.length > 0 },
      { id: "practical_task_result", label: "Practical task result", enabled: enabledFields.includes("practical_task_result"), available: Boolean(attempt) },
      { id: "peer_reviews", label: "Peer reviews", enabled: enabledFields.includes("peer_reviews"), available: peerReviews.length > 0 },
      { id: "teacher_feedback", label: "Teacher feedback", enabled: enabledFields.includes("teacher_feedback"), available: asEvidenceArray(summary.teacherFeedback).length > 0 },
      { id: "learner_name", label: "Name", enabled: enabledFields.includes("learner_name"), available: Boolean(profile?.name) },
      { id: "learner_contact", label: "Contact", enabled: enabledFields.includes("learner_contact"), available: Boolean(profile?.email || profile?.contactNumber) },
      { id: "learner_institution", label: "Education", enabled: enabledFields.includes("learner_institution"), available: Boolean(profile?.institution) },
      { id: "learner_career_goal", label: "Professional summary", enabled: enabledFields.includes("learner_career_goal"), available: Boolean(profile?.careerGoal || profile?.skillsSummary) },
      { id: "learner_skills_summary", label: "Other skills", enabled: enabledFields.includes("learner_skills_summary"), available: Boolean(profile?.skillsSummary) || records.length > 1 },
      { id: "learner_photo", label: "Profile picture", enabled: enabledFields.includes("learner_photo"), available: Boolean(profilePhotoUrl) },
    ];
  }, [activeRecord, summary, enabledFields, githubStats.repos, githubStats.activities, lmsRows.length, attempt, peerReviews.length, profile, records.length, profilePhotoUrl]);

  useEffect(() => {
    if (!summary) return;
    const next: WalletShareFieldId[] = ["competency_name", "verification_status", "learner_name", "learner_contact"];
    if (githubStats.repos > 0 || githubStats.activities > 0) next.push("github_evidence");
    if (lmsRows.length > 0) next.push("lms_evidence");
    if (attempt) next.push("practical_task_result");
    if (peerReviews.length > 0) next.push("peer_reviews");
    if (profile?.institution) next.push("learner_institution", "learner_program");
    if (profile?.careerGoal) next.push("learner_career_goal");
    if (profile?.skillsSummary || records.length > 1) next.push("learner_skills_summary");
    if (profilePhotoUrl) next.push("learner_photo");
    setEnabledFields(next);
  }, [activeRecord?.competencyId, profilePhotoUrl]);

  const credentialIssued = activeRecord
    ? credentials.some((credential) =>
      credential.skill === activeRecord.competencyName || credential.name === activeRecord.competencyName,
    )
    : false;
  const institutionApproved = /approv|attest|issued|verified/i.test(
    summary?.institutionReview.status ?? "",
  );
  const verified = credentialIssued || institutionApproved || activeRecord?.status === "Passed" || activeRecord?.status === "Review Available";
  const statusLabel = credentialIssued || institutionApproved
    ? "Verified"
    : activeRecord?.status ?? "Collected";
  const lastSync = githubSyncedAt ?? moodleSyncedAt ?? activeRecord?.updatedAt ?? null;
  const taskLabel = attempt
    ? `${attempt.scorePercent != null ? `${attempt.scorePercent}% · ` : ""}${attempt.status}`
    : null;

  const handleGenerateShare = async () => {
    if (!activeRecord) return;
    const selected = new Set<WalletShareFieldId>(
      shareToggles.filter((toggle) => toggle.enabled && toggle.available).map((toggle) => toggle.id),
    );
    if (selected.has("learner_institution")) {
      if (profile?.program) selected.add("learner_program");
      if (profile?.cityCountry) selected.add("learner_location");
    }
    if (selected.has("competency_name")) selected.add("competency_domain");
    if (selected.size === 0) {
      toast({ title: "Select at least one field to share", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await shareWalletCompetencyApi({
        competencyId: activeRecord.competencyId,
        selectionMode: "custom",
        selectedFields: [...selected],
        shareScope,
        expiresInDays,
      });
      setShareUrl(result.shareUrl);
      setShareToken(result.token);
      try {
        sessionStorage.setItem(
          `sijil.share.${result.shareId}`,
          JSON.stringify({ token: result.token, url: result.shareUrl }),
        );
      } catch {
        // ignore quota / private-mode failures
      }
      const detail = await getWalletCompetencyApi(activeRecord.competencyId);
      if (detail) setShares(detail.shares);
      toast({
        title: "Share link created",
        description: shareScope === "selected"
          ? `Only ${activeRecord.competencyName} included for recruiters.`
          : `${records.length} competenc${records.length === 1 ? "y" : "ies"} included for recruiters.`,
      });
    } catch (shareError) {
      toast({
        title: "Could not create share link",
        description: shareError instanceof Error ? shareError.message : "Share generation failed.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading || loading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={6} />
      </LearnerWorkspaceShell>
    );
  }

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <WalletRefreshBar onRefresh={() => void loadRecords()} loading={loading} />

      {error ? (
        <div className="learner-stat-card p-6 text-sm text-destructive">{error}</div>
      ) : !activeRecord || !summary ? (
        <WalletEmptyState
          onGoTask={() => navigate("/learner/task")}
          onGoIntegrations={() => navigate("/learner/integrations")}
        />
      ) : (
        <>
          <WalletWorkspaceHeader
            competencyName={activeRecord.competencyName}
            records={records}
            selectedId={activeRecord.competencyId}
            onSelect={setSelectedId}
            statusLabel={statusLabel}
            verified={verified}
            lastSync={lastSync}
          />
          <WalletStepper />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.95fr)]">
            <div className="space-y-4">
              <ConnectedSourcesCard
                sources={connectedSources}
                onConnect={() => navigate("/learner/integrations")}
              />
              <AuditLedgerCard events={buildLedgerEvents(summary)} />
            </div>

            <CompetencyPackageCard
              competencyName={summary.competency.name}
              github={githubStats}
              lmsRows={lmsRows}
              taskLabel={taskLabel}
            />

            <div className="space-y-4">
              <EvidenceInspectorCard
                source={inspectorSource}
                onSourceChange={setInspectorSource}
                availableSources={availableSources}
                githubRepos={asEvidenceArray(summary.github.repos).map((repo) => ({
                  name: textValue(repo.full_name) || textValue(repo.repo_name) || "Repository",
                  language: textValue(repo.primary_language) || null,
                  commits: numberValue(repo.commit_count),
                  url: textValue(repo.github_url) || null,
                }))}
                lmsAssignments={[
                  ...asEvidenceArray(summary.lms.assignments),
                  ...asEvidenceArray(summary.lms.evidence),
                ].map((row) => ({
                  name: textValue(row.name) || textValue(row.assignment_name) || textValue(row.activity_name) || "Assignment",
                  course: textValue(row.course_name) || "LMS",
                  grade: row.grade != null ? String(row.grade) : "—",
                }))}
                taskDetail={taskLabel}
                reviews={peerReviews.map((review) => ({
                  reviewer: textValue(review.reviewer_name) || "Reviewer",
                  text: textValue(review.review_text) || textValue(review.comment) || "Review submitted",
                }))}
                onViewPackage={() => setSelectedRecord(activeRecord)}
              />
              <OneClickShareCard
                toggles={shareToggles}
                photoPreviewUrl={profilePhotoUrl}
                shareScope={shareScope}
                onShareScopeChange={setShareScope}
                selectedCompetencyName={activeRecord.competencyName}
                competencyCount={records.length}
                onToggle={(id, next) => {
                  setEnabledFields((current) => next
                    ? [...new Set([...current, id])]
                    : current.filter((field) => field !== id));
                }}
                expiresInDays={expiresInDays}
                onExpiresChange={setExpiresInDays}
                shareUrl={shareUrl}
                shareToken={shareToken}
                shareId={shares.find((share) => share.shareStatus === "Active")?.id ?? null}
                tokenHint={shares.find((share) => share.shareStatus === "Active")?.tokenHint ?? null}
                expiresAt={shares.find((share) => share.shareStatus === "Active")?.expiresAt ?? null}
                shares={shares}
                submitting={submitting}
                onGenerate={() => void handleGenerateShare()}
                onRevoke={async (shareId) => {
                  setSubmitting(true);
                  try {
                    const ok = await revokeWalletShareApi(shareId);
                    if (!ok) throw new Error("Revocation failed.");
                    setShares((current) => current.map((share) => (
                      share.id === shareId
                        ? { ...share, shareStatus: "Revoked", revokedAt: new Date().toISOString() }
                        : share
                    )));
                    setShareUrl(null);
                    setShareToken(null);
                    toast({ title: "Share link revoked" });
                  } catch (revokeError) {
                    toast({
                      title: "Could not revoke share link",
                      description: revokeError instanceof Error ? revokeError.message : "Revoke failed.",
                      variant: "destructive",
                    });
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        </>
      )}

      <WalletEvidenceDialog
        record={selectedRecord}
        fallbackDid={profile?.did ?? null}
        open={!!selectedRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
      />

    </LearnerWorkspaceShell>
  );
}

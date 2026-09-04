import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { CompetencyShareDialog } from "@/components/wallet/CompetencyShareDialog";
import { InfoHint } from "@/components/sijil/InfoHint";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { EmptyState } from "@/components/sijil/EmptyState";
import { StubControl } from "@/components/sijil/StubControl";
import { CardSurface } from "@/components/sijil/CardSurface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile } from "@/hooks/useLearnerData";
import {
  fetchWalletCompetencyRecords,
  type WalletCompetencyRecordView,
} from "@/lib/db/wallet-competency-records";
import type {
  WalletAttemptHistoryItem,
  WalletEvidenceSummary,
  WalletRecordStatus,
  WalletSourceBadge,
} from "@/lib/wallet-competency-shared";
import {
  Eye,
  Github,
  KeyRound,
  Link2,
  MessageSquare,
  RefreshCw,
  Wallet,
  FileText,
  GraduationCap,
  ClipboardList,
} from "lucide-react";
import { useCredentials } from "@/hooks/useLearnerData";
import { getWalletCompetenciesApi } from "@/services/api/wallet.api";
import { parseEvidenceMetadata } from "@/lib/wallet-evidence-mapping";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString();
}

function formatOptional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function statusVariant(
  status: WalletRecordStatus | string,
): "verified" | "info" | "warning" | "neutral" {
  if (status === "Passed" || status === "Review Available") return "verified";
  if (status === "Task Submitted") return "info";
  if (status === "Needs Improvement") return "warning";
  return "neutral";
}

function badgeVariant(
  badge: WalletSourceBadge,
): "neutral" | "info" | "verified" {
  if (badge === "GitHub") return "info";
  if (badge === "Reviews") return "verified";
  return "neutral";
}

function latestAttempt(summary: WalletEvidenceSummary): WalletAttemptHistoryItem | null {
  const practicalTask = summary?.practicalTask;
  if (!practicalTask) return null;
  return practicalTask.latestAttempt
    ?? (Array.isArray(practicalTask.attemptHistory) ? practicalTask.attemptHistory[0] : null)
    ?? null;
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
    <a href={href} target="_blank" rel="noreferrer" className="block transition-colors hover:bg-muted/20">
      {content}
    </a>
  );
}

function EmptyEvidenceNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function metadataText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return formatOptional(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asEvidenceArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

type ModalEvidenceView = {
  githubEvidence: Record<string, unknown>[];
  lmsEvidence: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
};

type LmsDisplayItem = {
  id: string;
  course_name: string;
  activity_name: string;
  grade: string | null;
  grade_max: string | null;
  feedback: string | null;
  title?: string;
  meta?: string;
  body?: string | null;
};

function isLmsSourceRow(row: Record<string, unknown>): boolean {
  const source = typeof row.source === "string" ? row.source.trim().toUpperCase() : "";
  return source === "LMS";
}

function resolveEvidencePackage(record: WalletCompetencyRecordView): WalletEvidenceSummary {
  if (record.evidencePackage) return record.evidencePackage;
  const legacy = asRecord((record as unknown as Record<string, unknown>).evidence_summary);
  if (legacy) return legacy as unknown as WalletEvidenceSummary;
  return record.evidencePackage;
}

function dedupeEvidenceRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];

  for (const row of rows) {
    const key = String(row.id ?? row.external_id ?? row.moodle_assignment_id ?? "");
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    deduped.push(row);
  }

  return deduped;
}

function buildModalEvidenceView(record: WalletCompetencyRecordView): ModalEvidenceView {
  const evidencePackage = resolveEvidencePackage(record);
  const github = evidencePackage?.github ?? {
    repos: [],
    activities: [],
    evidenceRecords: [],
    reviews: [],
  };
  const lms = evidencePackage?.lms ?? {
    evidence: [],
    courses: [],
    assignments: [],
    grades: [],
    importedEvidence: [],
  };

  const repos = asEvidenceArray(github.repos);
  const activities = asEvidenceArray(github.activities);
  const allEvidenceRecords = asEvidenceArray(github.evidenceRecords);
  const evidenceRecords = allEvidenceRecords.filter((row) => !isLmsSourceRow(row));
  const reviews = asEvidenceArray(github.reviews);
  const primaryLmsEvidence = asEvidenceArray(lms.evidence);
  const assignments = asEvidenceArray(lms.assignments);
  const teacherFeedback = asEvidenceArray(evidencePackage?.teacherFeedback);
  const lmsRowsFromGithub = allEvidenceRecords.filter(isLmsSourceRow);
  const importedEvidence = asEvidenceArray(lms.importedEvidence);

  return {
    githubEvidence: [...repos, ...activities, ...evidenceRecords, ...reviews],
    lmsEvidence: dedupeEvidenceRows([
      ...primaryLmsEvidence,
      ...lmsRowsFromGithub,
      ...importedEvidence,
    ]),
    assignments,
    teacherFeedback,
  };
}

function feedbackFromTeacherRows(
  itemId: string,
  teacherFeedback: Record<string, unknown>[],
  directFeedback: string | null,
): string | null {
  if (directFeedback) return directFeedback;

  for (const row of teacherFeedback) {
    const assignmentId = metadataText(row.moodle_assignment_id);
    const evidenceId = metadataText(row.evidence_record_id);
    const text = metadataText(row.feedback_text);
    if (!text) continue;
    if (itemId && (itemId === assignmentId || itemId === evidenceId)) return text;
  }

  return null;
}

function buildLmsDisplayItems(
  modalEvidenceView: ModalEvidenceView,
  courses: Record<string, unknown>[],
): LmsDisplayItem[] {
  const items: LmsDisplayItem[] = [];
  const seen = new Set<string>();

  const push = (item: LmsDisplayItem) => {
    const key = item.id || `${item.course_name}:${item.activity_name}`;
    if (!key.trim() || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const row of modalEvidenceView.lmsEvidence) {
    const metadata = parseEvidenceMetadata(row.metadata);
    const id = String(row.id ?? row.external_id ?? "");
    const directFeedback = metadataText(metadata.teacher_feedback)
      ?? metadataText(row.feedback_preview)
      ?? metadataText(row.feedback);

    push({
      id,
      course_name: metadataText(metadata.course_name)
        ?? metadataText(row.course_name)
        ?? "N/A",
      activity_name: metadataText(metadata.activity_name)
        ?? metadataText(metadata.assignment_name)
        ?? metadataText(row.activity_name)
        ?? metadataText(row.assignment_name)
        ?? metadataText(row.text_preview)
        ?? "N/A",
      grade: metadataText(metadata.grade) ?? metadataText(row.grade),
      grade_max: metadataText(metadata.grade_max) ?? metadataText(row.grade_max),
      feedback: feedbackFromTeacherRows(id, modalEvidenceView.teacherFeedback, directFeedback),
      title: metadataText(metadata.assignment_name)
        ?? metadataText(row.assignment_name)
        ?? metadataText(row.activity_name)
        ?? metadataText(row.text_preview)
        ?? metadataText(metadata.course_name)
        ?? metadataText(row.course_name)
        ?? "LMS Evidence",
      meta: `Course: ${metadataText(metadata.course_name) ?? metadataText(row.course_name) ?? "N/A"} · Grade: ${formatGradeLine(
        metadataText(metadata.grade) ?? metadataText(row.grade),
        metadataText(metadata.grade_max) ?? metadataText(row.grade_max),
      )}`,
    });
  }

  for (const row of modalEvidenceView.assignments) {
    const metadata = parseEvidenceMetadata(row.metadata);
    const id = String(row.moodle_assignment_id ?? row.id ?? "");
    const directFeedback = metadataText(row.feedback_preview)
      ?? metadataText(row.feedback)
      ?? metadataText(metadata.teacher_feedback);

    push({
      id,
      course_name: metadataText(metadata.course_name)
        ?? metadataText(row.course_name)
        ?? courseNameForAssignment(row, courses),
      activity_name: metadataText(row.activity_name)
        ?? metadataText(row.name)
        ?? metadataText(metadata.assignment_name)
        ?? "N/A",
      grade: metadataText(row.grade) ?? metadataText(metadata.grade),
      grade_max: metadataText(row.grade_max) ?? metadataText(metadata.grade_max),
      feedback: feedbackFromTeacherRows(id, modalEvidenceView.teacherFeedback, directFeedback),
      title: metadataText(row.name)
        ?? metadataText(metadata.assignment_name)
        ?? metadataText(row.activity_name)
        ?? "LMS Evidence",
      meta: `Course: ${metadataText(metadata.course_name) ?? metadataText(row.course_name) ?? courseNameForAssignment(row, courses)} · Grade: ${formatGradeLine(
        metadataText(row.grade) ?? metadataText(metadata.grade),
        metadataText(row.grade_max) ?? metadataText(metadata.grade_max),
      )}`,
    });
  }

  for (const row of modalEvidenceView.teacherFeedback) {
    const text = metadataText(row.feedback_text);
    if (!text) continue;
    const id = String(row.moodle_assignment_id ?? row.evidence_record_id ?? text.slice(0, 24));
    push({
      id,
      course_name: metadataText(row.course_name) ?? "LMS Course",
      activity_name: metadataText(row.source) ?? metadataText(row.assignment_name) ?? "Teacher feedback",
      grade: null,
      grade_max: null,
      feedback: text,
      title: metadataText(row.source) ?? "Teacher feedback",
      meta: metadataText(row.course_name) ?? "LMS Course",
    });
  }

  return items;
}

function formatGradeLine(grade: string | null, gradeMax: string | null): string {
  if (grade && gradeMax) return `${grade} / ${gradeMax}`;
  if (grade) return grade;
  if (gradeMax) return gradeMax;
  return "N/A";
}

function courseNameForAssignment(
  assignment: Record<string, unknown>,
  courses: Record<string, unknown>[],
): string {
  const metadata = parseEvidenceMetadata(assignment.metadata);
  const fromMetadata = metadataText(metadata.course_name);
  if (fromMetadata) return fromMetadata;

  const courseId = typeof assignment.moodle_course_id === "string" || typeof assignment.moodle_course_id === "number"
    ? String(assignment.moodle_course_id)
    : "";
  if (!courseId) return "N/A";

  const course = courses.find((row) => String(row.moodle_course_id ?? "") === courseId);
  return metadataText(course?.fullname) ?? metadataText(course?.shortname) ?? "N/A";
}

function WalletLmsItemCard({ item }: { item: LmsDisplayItem }) {
  const gradeLine = formatGradeLine(item.grade, item.grade_max);
  const title = item.course_name !== "N/A" ? item.course_name : item.activity_name;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div>
          <div className="text-[11px] text-muted-foreground">Course</div>
          <div className="mt-0.5">{item.course_name}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Assignment</div>
          <div className="mt-0.5">{item.activity_name}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Grade</div>
          <div className="mt-0.5">{gradeLine}</div>
        </div>
        {item.feedback && (
          <div>
            <div className="text-[11px] text-muted-foreground">Feedback</div>
            <div className="mt-0.5 text-muted-foreground">{item.feedback}</div>
          </div>
        )}
      </div>
    </div>
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
  const modalEvidenceView = buildModalEvidenceView(record);

  const githubRepos = Array.isArray(summary?.github?.repos) ? summary.github.repos : [];
  const githubActivities = Array.isArray(summary?.github?.activities) ? summary.github.activities : [];
  const githubEvidenceRecords = Array.isArray(summary?.github?.evidenceRecords)
    ? summary.github.evidenceRecords.filter((row) => !isLmsSourceRow(row))
    : [];
  const githubReviews = Array.isArray(summary?.github?.reviews) ? summary.github.reviews : [];
  const lmsItems = [
    ...(record?.evidencePackage?.lms?.evidence ?? []),
    ...(record?.evidencePackage?.lms?.assignments ?? []),
  ];
  const teacherFeedback = Array.isArray(summary?.teacherFeedback) ? summary.teacherFeedback : [];
  const peerReviews = [
    ...(Array.isArray(summary?.peerReviews)
      ? summary.peerReviews
      : []),

    ...(Array.isArray(summary?.github?.reviews)
      ? summary.github.reviews.map((review) => ({
        reviewer_name:
          review.comment_author
          ?? review.author
          ?? "GitHub Reviewer",

        reviewer_role:
          "GitHub Review",

        review_text:
          review.comment_body
          ?? review.body
          ?? review.comment
          ?? "GitHub contribution review",

        source:
          "GitHub",

        reviewed_at:
          review.comment_created_at
          ?? review.created_at
          ?? null,
      }))
      : []),

    ...(Array.isArray(summary?.teacherFeedback)
      ? summary.teacherFeedback.map((feedback) => ({
        reviewer_name:
          "Teacher Feedback",

        reviewer_role:
          "LMS",

        review_text:
          feedback.feedback_text
          ?? feedback.feedback
          ?? "No feedback",

        source:
          "LMS",

        reviewed_at:
          feedback.reviewed_at
          ?? feedback.synced_at
          ?? null,
      }))
      : []),
  ] as Record<string, unknown>[];
  const attemptHistory = Array.isArray(summary?.practicalTask?.attemptHistory)
    ? summary.practicalTask.attemptHistory
    : [];

  const githubItems = modalEvidenceView.githubEvidence;
  const did = summary?.learner?.did ?? fallbackDid;
  const attempt = latestAttempt(summary);
  const shownFeedback = new Set(
    lmsItems
      .map((item) => {
        const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : {};
        return formatOptional(item.feedback_preview)
          ?? formatOptional(metadata.teacher_feedback)
          ?? formatOptional(item.feedback)
          ?? formatOptional(item.text_preview);
      })
      .filter((value): value is string => Boolean(value)),
  );
  const peerReviewTexts = new Set(
    peerReviews
      .map((review) => formatOptional(review.review_text))
      .filter((value): value is string => Boolean(value)),
  );
  const standaloneTeacherFeedback = teacherFeedback.filter((feedback) => {
    const text = formatOptional(feedback.feedback_text);
    if (!text) return false;
    return !shownFeedback.has(text) && !peerReviewTexts.has(text);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>{record.competencyName}</DialogTitle>
          <DialogDescription>
            Competency evidence package for {record.domain}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-2">
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-muted-foreground">Competency</div>
                <div className="mt-1 font-medium">{record.competencyName}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Domain</div>
                <div className="mt-1 font-medium">{record.domain}</div>
              </div>
              {record.description && (
                <div className="md:col-span-2">
                  <div className="text-[11px] text-muted-foreground">Description</div>
                  <div className="mt-1 text-sm text-muted-foreground">{record.description}</div>
                </div>
              )}
              {did && (
                <div className="md:col-span-2">
                  <div className="text-[11px] text-muted-foreground">Learner DID</div>
                  <div className="mono mt-1 break-all text-xs">{did}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-muted-foreground">Overall status</div>
                <div className="mt-1">
                  <StatusBadge variant={statusVariant(record.status)}>{record.status}</StatusBadge>
                </div>
              </div>
              {record.taskResult && (
                <div>
                  <div className="text-[11px] text-muted-foreground">Task result</div>
                  <div className="mt-1">
                    <StatusBadge variant={statusVariant(record.taskResult)}>{record.taskResult}</StatusBadge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="github" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="github" className="gap-1.5">
                <Github className="h-3.5 w-3.5" /> GitHub
              </TabsTrigger>
              <TabsTrigger value="lms" className="gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> LMS
              </TabsTrigger>
              {(attemptHistory.length > 0 || attempt) && (
                <TabsTrigger value="task" className="gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> Practical Task
                </TabsTrigger>
              )}
              {peerReviews.length > 0 && (
                <TabsTrigger value="reviews" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Reviews
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="github" className="mt-4 space-y-3">
              {githubItems.length > 0 ? (
                <>
                  {Array.isArray(githubRepos) && githubRepos.map((repo, index) => (
                    <ItemCard
                      key={`repo-${index}`}
                      title={formatOptional(repo.full_name) ?? formatOptional(repo.repo_name) ?? "Repository"}
                      meta={[
                        formatOptional(repo.primary_language),
                        typeof repo.commit_count === "number" ? `${repo.commit_count} commits` : null,
                        formatDate(formatOptional(repo.last_updated) ?? formatOptional(repo.synced_at)),
                      ].filter(Boolean).join(" · ")}
                      body={formatOptional(repo.description)}
                      href={formatOptional(repo.github_url)}
                    />
                  ))}
                  {Array.isArray(githubActivities) && githubActivities.map((activity, index) => (
                    <ItemCard
                      key={`activity-${index}`}
                      title={formatOptional(activity.activity_title) ?? "GitHub activity"}
                      meta={[
                        formatOptional(activity.activity_type),
                        formatOptional(activity.repo_name),
                        formatDate(formatOptional(activity.occurred_at) ?? formatOptional(activity.synced_at)),
                      ].filter(Boolean).join(" · ")}
                      body={formatOptional(activity.commit_hash)}
                      href={formatOptional(activity.activity_url)}
                    />
                  ))}
                  {Array.isArray(githubEvidenceRecords) && githubEvidenceRecords.map((item, index) => (
                    <ItemCard
                      key={`evidence-${index}`}
                      title={formatOptional(item.repository_name) ?? "Evidence record"}
                      meta={[
                        formatOptional(item.status),
                        formatOptional(item.language),
                        formatDate(formatOptional(item.sync_date)),
                      ].filter(Boolean).join(" · ")}
                      href={formatOptional(item.repository_url)}
                    />
                  ))}
                  {Array.isArray(githubReviews) && githubReviews.map((review, index) => (
                    <ItemCard
                      key={`review-${index}`}
                      title={formatOptional(review.discussion_title) ?? "GitHub review"}
                      meta={[
                        formatOptional(review.review_type),
                        formatOptional(review.comment_author),
                        formatDate(formatOptional(review.comment_created_at)),
                      ].filter(Boolean).join(" · ")}
                      body={formatOptional(review.comment_body)}
                      href={formatOptional(review.discussion_url)}
                    />
                  ))}
                </>
              ) : (
                <EmptyEvidenceNote message="No GitHub evidence available" />
              )}
            </TabsContent>

            <TabsContent value="lms" className="mt-4 space-y-3">
              {lmsItems.length > 0 ? (
                lmsItems.map((item: Record<string, unknown>, index: number) => {
                  const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
                    ? item.metadata as Record<string, unknown>
                    : {};

                  return (
                    <ItemCard
                      key={`lms-${index}`}
                      title={
                        formatOptional(item.course_name)
                        ?? formatOptional(item.assignment_name)
                        ?? formatOptional(item.activity_name)
                        ?? formatOptional(item.name)
                        ?? "LMS Evidence"
                      }
                      meta={[
                        item.grade
                          ? `Grade: ${item.grade}`
                          : metadata.grade != null
                            ? `Grade: ${metadata.grade}/${metadata.grade_max ?? ""}`
                            : null,
                        formatOptional(item.completion_status),
                      ].filter(Boolean).join(" · ")}
                      body={
                        formatOptional(item.feedback_preview)
                        ?? formatOptional(metadata.teacher_feedback)
                        ?? formatOptional(item.feedback)
                        ?? formatOptional(item.text_preview)
                        ?? "No feedback available"
                      }
                    />
                  );
                })
              ) : (
                <EmptyEvidenceNote message="No LMS evidence available" />
              )}
            </TabsContent>

            {(attemptHistory.length > 0 || attempt) && (
              <TabsContent value="task" className="mt-4 space-y-3">
                {attempt && (
                  <Card>
                    <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Latest attempt</div>
                        <div className="mt-1 font-medium">{attempt.title}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Status</div>
                        <div className="mt-1">
                          <StatusBadge variant={statusVariant(attempt.status)}>{attempt.status}</StatusBadge>
                        </div>
                      </div>
                      {attempt.scorePercent != null && (
                        <div>
                          <div className="text-[11px] text-muted-foreground">Score</div>
                          <div className="mt-1 text-sm font-medium">{attempt.scorePercent}%</div>
                        </div>
                      )}
                      {attempt.correctCount != null && attempt.totalQuestions != null && (
                        <div>
                          <div className="text-[11px] text-muted-foreground">Correct answers</div>
                          <div className="mt-1 text-sm font-medium">
                            {attempt.correctCount} / {attempt.totalQuestions}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] text-muted-foreground">Submitted</div>
                        <div className="mt-1 text-sm font-medium">{formatDate(attempt.submittedAt)}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {Array.isArray(attemptHistory) && attemptHistory.map((item) => (
                  <ItemCard
                    key={item.attemptId}
                    title={item.title}
                    meta={[
                      item.status,
                      item.scorePercent != null ? `${item.scorePercent}%` : null,
                      formatDate(item.submittedAt),
                    ].filter(Boolean).join(" · ")}
                    body={item.attemptId}
                  />
                ))}
              </TabsContent>
            )}

            {peerReviews.length > 0 && (
              <TabsContent value="reviews" className="mt-4 space-y-3">
                {Array.isArray(peerReviews) && peerReviews.map((review, index) => (
                  <ItemCard
                    key={`peer-${index}`}
                    title={formatOptional(review.reviewer_name) ?? formatOptional(review.reviewerName) ?? "Peer review"}
                    meta={[
                      formatOptional(review.reviewer_role) ?? formatOptional(review.reviewerRole),
                      formatOptional(review.source),
                      formatDate(formatOptional(review.reviewed_at) ?? formatOptional(review.review_date) ?? formatOptional(review.date)),
                    ].filter(Boolean).join(" · ")}
                    body={formatOptional(review.review_text) ?? formatOptional(review.comment) ?? formatOptional(review.body)}
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
  const [derivedRecordsById, setDerivedRecordsById] = useState<Map<string, WalletCompetencyRecordView>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<WalletCompetencyRecordView | null>(null);
  const [shareRecord, setShareRecord] = useState<WalletCompetencyRecordView | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setRecords([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const derivedRecords = await fetchWalletCompetencyRecords(user.id);
      const apiRecords = await getWalletCompetenciesApi();
      if (!apiRecords?.length) {
        const derivedById = new Map(derivedRecords.map((record) => [record.competencyId, record]));
        return { merged: derivedRecords, derivedById };
      }

      const derivedById = new Map(derivedRecords.map((record) => [record.competencyId, record]));
      const merged = apiRecords.map((record) => derivedById.get(record.competencyId) ?? record);
      for (const record of derivedRecords) {
        if (!merged.some((item) => item.competencyId === record.competencyId)) {
          merged.push(record);
        }
      }
      return { merged, derivedById };
    })()
      .then((result) => {
        if (!active) return;
        setRecords(result.merged);
        setDerivedRecordsById(result.derivedById);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Could not load wallet records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const summary = useMemo(() => ({
    total: records.length,
    passed: records.filter((record) => record.taskResult === "Passed").length,
    evidence: records.reduce((total, record) => total + record.evidenceCount, 0),
  }), [records]);

  const credentialIdForRecord = (record: WalletCompetencyRecordView) => {
    const match = credentials.find(
      (c) => c.skill === record.competencyName || c.name === record.competencyName,
    );
    return match?.id ?? record.id;
  };

  if (profileLoading || loading) {
    return (
      <AppShell role="learner">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Wallet"
        actions={(
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        )}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <CardSurface variant="flat" padding="hero" className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="font-semibold">SIJIL Wallet</span>
            </div>
            <StatusBadge variant="verified">Learner-controlled</StatusBadge>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Holder DID
              <InfoHint text="Decentralized Identifier — your competency wallet records remain bound to your learner identity." />
            </div>
            <div className="mono mt-1 break-all text-sm">{profile?.did ?? "—"}</div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border/60 pt-4">
            <Stat label="Wallet records" value={summary.total} />
            <Stat label="Passed tasks" value={summary.passed} />
            <Stat label="Evidence items" value={summary.evidence} />
          </div>
        </CardSurface>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-success" />
              Key material
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ed25519 — generated locally, never exported.
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <Row k="Verification key" v={profile?.did ? `${profile.did.slice(0, 8)}…` : "—"} />
              <Row k="Suite" v="DataIntegrityProof" />
              <Row k="Wallet mode" v="Competency record" />
            </div>
            <div className="mt-4">
              <StubControl
                label="Export key backup"
                reason="Local key export is planned for a future release. Keys remain device-bound for now."
                className="w-full justify-center"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competency Wallet Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="px-6 py-10 text-center text-sm text-destructive">
              {error}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallet records yet"
              description="Submit a practical task to create your first competency wallet record."
              action={{ label: "Start practical task", onClick: () => navigate("/learner/task") }}
              className="m-6 border-0 bg-transparent"
            />
          ) : (
            <div className="grid gap-5 p-6 md:grid-cols-2">
              {records.map((record) => (
                <Card key={record.id} className="overflow-hidden border-border/60">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">{record.competencyName}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{record.domain}</div>
                      </div>
                      <StatusBadge variant={statusVariant(record.status)}>{record.status}</StatusBadge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(record.sourceBadges) && record.sourceBadges.map((badge) => (
                        <StatusBadge key={badge} variant={badgeVariant(badge)}>
                          {badge}
                        </StatusBadge>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Task result</div>
                        <div className="mt-1 font-medium">{record.taskResult ?? "Evidence Collected"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Evidence count</div>
                        <div className="mt-1 font-medium">{record.evidenceCount}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[11px] text-muted-foreground">Last updated</div>
                        <div className="mt-1 font-medium">{formatDate(record.updatedAt)}</div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        className="w-full"
                        onClick={() => setSelectedRecord(derivedRecordsById.get(record.competencyId) ?? record)}
                      >
                        <Eye className="mr-1.5 h-4 w-4" />
                        View Evidence Package
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => setShareRecord(record)}>
                        <Link2 className="mr-1.5 h-4 w-4" />
                        Share with Recruiter
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground" asChild>
                      <Link to={`/learner/credential/${encodeURIComponent(credentialIdForRecord(record))}`}>
                        <FileText className="mr-1.5 h-4 w-4" />
                        View full credential
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WalletEvidenceDialog
  record={
    selectedRecord
      ? (derivedRecordsById.get(selectedRecord.competencyId) ?? selectedRecord)
      : null
  }
  fallbackDid={profile?.did ?? null}
  open={!!selectedRecord}
  onOpenChange={(open) => {
    if (!open) setSelectedRecord(null);
  }}
/>

      <CompetencyShareDialog
        record={shareRecord}
        open={!!shareRecord}
        onOpenChange={(open) => {
          if (!open) setShareRecord(null);
        }}
        onRecordSynced={(next) => {
          setRecords((current) => current.map((item) => (item.competencyId === next.competencyId ? next : item)));
          if (selectedRecord?.competencyId === next.competencyId) setSelectedRecord(next);
          if (shareRecord?.competencyId === next.competencyId) setShareRecord(next);
        }}
      />
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

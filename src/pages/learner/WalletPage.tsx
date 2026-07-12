import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { CompetencyShareDialog } from "@/components/wallet/CompetencyShareDialog";
import { InfoHint } from "@/components/sijil/InfoHint";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Fingerprint,
  Github,
  KeyRound,
  Link2,
  MessageSquare,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { getWalletCompetenciesApi } from "@/services/api/wallet.api";

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
  if (status === "Submitted") return "info";
  if (status === "Needs Improvement" || status === "Timed Out") return "warning";
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
  return summary.practicalTask.latestAttempt
    ?? summary.practicalTask.attemptHistory[0]
    ?? null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
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

function WalletEvidenceDialog({
  record,
  fallbackDid,
  open,
  onOpenChange,
}: {
  record: WalletCompetencyRecordView | null;
  fallbackDid: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  if (!record) return null;

  const summary = record.evidencePackage;
  const githubItems = [
    ...summary.github.repos,
    ...summary.github.activities,
    ...summary.github.evidenceRecords,
    ...summary.github.reviews,
  ];
  const lmsItems = [
    ...summary.lms.evidence,
    ...summary.lms.courses,
    ...summary.lms.assignments,
    ...summary.lms.grades,
    ...summary.lms.importedEvidence,
  ];
  const did = summary.learner.did ?? fallbackDid;
  const attempt = latestAttempt(summary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>{record.competencyName}</DialogTitle>
          <DialogDescription>
            Competency evidence package for {record.domain}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto pr-2">
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

          {githubItems.length > 0 && (
            <Section title="GitHub Evidence">
              {summary.github.repos.map((repo, index) => (
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
              {summary.github.activities.map((activity, index) => (
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
              {summary.github.evidenceRecords.map((item, index) => (
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
              {summary.github.reviews.map((review, index) => (
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
            </Section>
          )}

          {lmsItems.length > 0 && (
            <Section title="LMS / Moodle Evidence">
              {summary.lms.evidence.map((item, index) => (
                <ItemCard
                  key={`lms-evidence-${index}`}
                  title={formatOptional(item.course_name) ?? "LMS evidence"}
                  meta={[
                    formatOptional(item.grade),
                    formatOptional(item.completion_status),
                    formatDate(formatOptional(item.fetched_at)),
                  ].filter(Boolean).join(" · ")}
                  body={formatOptional(item.text_preview)}
                />
              ))}
              {summary.lms.courses.map((course, index) => (
                <ItemCard
                  key={`course-${index}`}
                  title={formatOptional(course.fullname) ?? formatOptional(course.shortname) ?? "Course"}
                  meta={formatDate(formatOptional(course.synced_at))}
                />
              ))}
              {summary.lms.assignments.map((assignment, index) => (
                <ItemCard
                  key={`assignment-${index}`}
                  title={formatOptional(assignment.name) ?? "Assignment"}
                  meta={[
                    formatOptional(assignment.grade_formatted)
                      ?? (typeof assignment.grade === "number" ? String(assignment.grade) : null),
                    formatOptional(assignment.submission_status),
                    formatDate(formatOptional(assignment.submitted_at) ?? formatOptional(assignment.graded_at) ?? formatOptional(assignment.synced_at)),
                  ].filter(Boolean).join(" · ")}
                />
              ))}
              {summary.lms.grades.map((grade, index) => (
                <ItemCard
                  key={`grade-${index}`}
                  title={formatOptional(grade.item_name) ?? "Grade"}
                  meta={[
                    formatOptional(grade.grade_formatted)
                      ?? (typeof grade.grade === "number" ? String(grade.grade) : null),
                    formatOptional(grade.item_type),
                    formatDate(formatOptional(grade.synced_at)),
                  ].filter(Boolean).join(" · ")}
                />
              ))}
              {summary.lms.importedEvidence.map((item, index) => (
                <ItemCard
                  key={`imported-${index}`}
                  title={formatOptional(item.activity_name) ?? "Imported LMS evidence"}
                  meta={[
                    formatOptional(item.course_name),
                    formatOptional(item.grade),
                    formatDate(formatOptional(item.imported_at)),
                  ].filter(Boolean).join(" · ")}
                  body={formatOptional(item.feedback_preview)}
                />
              ))}
            </Section>
          )}

          {summary.practicalTask.attemptHistory.length > 0 && (
            <Section title="Practical Task">
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

              {summary.practicalTask.attemptHistory.map((item) => (
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
            </Section>
          )}

          {summary.peerReviews.length > 0 && (
            <Section title="Peer Reviews">
              {summary.peerReviews.map((review, index) => (
                <ItemCard
                  key={`peer-${index}`}
                  title={formatOptional(review.reviewer_name) ?? formatOptional(review.reviewerName) ?? "Peer review"}
                  meta={[
                    formatOptional(review.reviewer_role) ?? formatOptional(review.reviewerRole),
                    formatOptional(review.source),
                    formatDate(formatOptional(review.reviewed_at) ?? formatOptional(review.review_date) ?? formatOptional(review.date)),
                  ].filter(Boolean).join(" · ")}
                  body={formatOptional(review.review_text) ?? formatOptional(review.comment)}
                />
              ))}
            </Section>
          )}

          {summary.teacherFeedback.length > 0 && (
            <Section title="Teacher Feedback">
              {summary.teacherFeedback.map((feedback, index) => (
                <ItemCard
                  key={`teacher-${index}`}
                  title={formatOptional(feedback.source) ?? "Teacher feedback"}
                  meta={[
                    formatOptional(feedback.status),
                    formatDate(formatOptional(feedback.reviewed_at) ?? formatOptional(feedback.synced_at)),
                  ].filter(Boolean).join(" · ")}
                  body={formatOptional(feedback.feedback_text)}
                />
              ))}
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WalletPage() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const [records, setRecords] = useState<WalletCompetencyRecordView[]>([]);
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
      const apiRecords = await getWalletCompetenciesApi();
      if (apiRecords) return apiRecords;
      return fetchWalletCompetencyRecords(user.id);
    })()
      .then((next) => {
        if (!active) return;
        setRecords(next);
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

  if (profileLoading || loading) {
    return (
      <AppShell role="learner">
        <div className="text-sm text-muted-foreground">Loading wallet…</div>
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Wallet"
        description="Your competency-centered wallet. Each competency record stores its evidence package, practical task history, and review context under your holder DID."
        actions={(
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        )}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="credential-card p-6 text-primary-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                <span className="font-medium">SIJIL Wallet</span>
              </div>
              <StatusBadge variant="verified">Learner-controlled</StatusBadge>
            </div>
            <div className="mt-6">
              <div className="flex items-center gap-1.5 text-xs opacity-70">
                Holder DID
                <InfoHint text="Decentralized Identifier — your competency wallet records remain bound to your learner identity." />
              </div>
              <div className="mono mt-1 break-all text-sm">{profile?.did ?? "—"}</div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <Stat dark label="Wallet records" value={summary.total} />
              <Stat dark label="Passed tasks" value={summary.passed} />
              <Stat dark label="Evidence items" value={summary.evidence} />
            </div>
          </div>
        </Card>

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
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No competency wallet records yet. Submit a practical task to create your first wallet record.
            </div>
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
                      {record.sourceBadges.map((badge) => (
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
                        <div className="text-[11px] text-muted-foreground">Task score</div>
                        <div className="mt-1 font-medium">
                          {latestAttempt(record.evidencePackage)?.scorePercent != null
                            ? `${latestAttempt(record.evidencePackage)?.scorePercent}%`
                            : "—"}
                        </div>
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
                      <Button className="w-full" onClick={() => setSelectedRecord(record)}>
                        <Eye className="mr-1.5 h-4 w-4" />
                        View Evidence Package
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => setShareRecord(record)}>
                        <Link2 className="mr-1.5 h-4 w-4" />
                        Share with Recruiter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WalletEvidenceDialog
        record={selectedRecord}
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

function Stat({ label, value, dark }: { label: string; value: number; dark?: boolean }) {
  return (
    <div>
      <div className={`text-[11px] ${dark ? "opacity-70" : "text-muted-foreground"}`}>{label}</div>
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

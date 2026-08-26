import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { CardSurface } from "@/components/sijil/CardSurface";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Check, X, ChevronDown, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstitutionAttestationRequest } from "@/hooks/useInstitutionAttestationRequests";
import {
  evidencePackageForDisplay,
  formatMcqPercentageLabel,
  resolveCompetencyDomain,
  resolveCompetencyName,
  resolveLearnerEmail,
  resolveLearnerName,
  updateInstitutionAttestationRequest,
} from "@/lib/db/institution-attestation-requests";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const MCQ_THRESHOLD = 70;

export default function AttestationRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { request, loading, refresh } = useInstitutionAttestationRequest(id);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  if (loading) {
    return (
      <AppShell role="institution">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  if (!request) {
    return (
      <AppShell role="institution">
        <PageHeader title="Request not found" />
        <Button variant="outline" onClick={() => navigate("/institution/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />Back to dashboard
        </Button>
      </AppShell>
    );
  }

  const decide = async (status: "approved" | "rejected") => {
    if (status === "rejected" && !feedback.trim()) {
      toast({ title: "Feedback required", description: "Add institution feedback before rejecting.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await updateInstitutionAttestationRequest(request.id, {
        status,
        institutionFeedback: feedback.trim() || undefined,
        reviewedBy: user?.id,
      });
      await refresh();
      toast({
        title: status === "approved" ? "Attestation approved" : "Attestation rejected",
        description: status === "approved"
          ? "Credential has been issued to the learner wallet."
          : "Learner has been notified.",
      });
      setFeedback("");
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const pkg = request.evidencePackage;
  const mcqPercent = request.testPercentage ?? request.practicalTaskResult.scorePercent ?? 0;
  const meetsThreshold = mcqPercent >= MCQ_THRESHOLD;

  return (
    <AppShell role="institution">
      <PageHeader
        title="Institution Attestation Request"
        description="Full evidence package submitted after practical MCQ completion."
        breadcrumbs={[
          { label: "Dashboard", href: "/institution/dashboard" },
          { label: "Attestation Request" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/institution/attestation/${request.id}/validation`)}
            >
              <GitBranch className="h-4 w-4 mr-1.5" />
              Validation trail
            </Button>
            <StatusBadge variant={request.status === "approved" ? "verified" : request.status === "rejected" ? "destructive" : "warning"}>
              {request.status}
            </StatusBadge>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <CardSurface variant="flat">
            <h2 className="text-base font-semibold mb-1">Learner</h2>
            <FieldRow label="Name" value={resolveLearnerName(request)} />
            <FieldRow label="Email" value={resolveLearnerEmail(request)} />
            <FieldRow label="Institution" value={request.institutionName} />
            <FieldRow label="Student ID" value={pkg.learner.studentId ?? "—"} mono />
            <FieldRow label="Program" value={pkg.learner.program ?? "—"} />
            <FieldRow label="Batch" value={pkg.learner.batch ?? "—"} />
          </CardSurface>

          <CardSurface variant="flat">
            <h2 className="text-base font-semibold mb-1">Competency</h2>
            <FieldRow label="Declared Competency" value={resolveCompetencyName(request)} />
            <FieldRow label="Domain" value={resolveCompetencyDomain(request)} />
            <FieldRow
              label="Declared at"
              value={pkg.competency.declaredAt ? new Date(pkg.competency.declaredAt).toLocaleString() : "—"}
            />
            <FieldRow
              label="Submitted"
              value={new Date(request.submittedToInstitutionAt).toLocaleString()}
            />
          </CardSurface>

          <CardSurface variant="flat">
            <h2 className="text-base font-semibold mb-1">Evidence summary</h2>
            <FieldRow label="GitHub" value={request.githubEvidence.length} />
            <FieldRow label="Moodle/LMS" value={request.moodleEvidence.length} />
            <FieldRow label="Certificates" value={request.certificateEvidence.length} />
            <FieldRow label="Peer reviews" value={request.peerReviewEvidence.length} />
          </CardSurface>

          <CardSurface variant="flat">
            <h2 className="text-base font-semibold mb-3">Practical MCQ result</h2>
            <FieldRow label="Title" value={request.practicalTaskResult.title} />
            <FieldRow label="MCQ percentage" value={formatMcqPercentageLabel(request)} />
            <FieldRow label="Attempt ID" value={request.practicalTaskResult.attemptId} mono />

            <div className="py-2.5 border-b border-border/60">
              <div className="grid grid-cols-[180px_1fr] gap-4">
                <div className="text-sm text-muted-foreground">Review threshold</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className={cn("font-medium", meetsThreshold ? "text-success" : "text-destructive")}>
                      {meetsThreshold ? "Meets 70% threshold" : "Below 70% threshold"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{Math.round(mcqPercent)}% / {MCQ_THRESHOLD}%</span>
                  </div>
                  <Progress
                    value={Math.min(100, mcqPercent)}
                    className={cn("h-2", meetsThreshold ? "[&>div]:bg-success" : "[&>div]:bg-destructive")}
                  />
                  <div className="relative h-0">
                    <div
                      className="absolute -top-2 h-2 w-0.5 bg-muted-foreground/50"
                      style={{ left: `${MCQ_THRESHOLD}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            </div>

            <FieldRow label="Feedback" value={request.practicalTaskResult.feedback || "—"} />

            {request.practicalTaskResult.criteriaResults?.length > 0 && (
              <div className="py-2.5 border-b border-border/60 last:border-0">
                <div className="grid grid-cols-[180px_1fr] gap-4">
                  <div className="text-sm text-muted-foreground">Rubric criteria</div>
                  <div className="space-y-2">
                    {request.practicalTaskResult.criteriaResults.map((c, i) => (
                      <div key={i} className="rounded-md border p-2 text-xs">
                        <div className="font-medium">{String(c.criterion ?? `Criterion ${i + 1}`)}</div>
                        <div className="text-muted-foreground">{String(c.reason ?? c.notes ?? "")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <FieldRow
              label="Learner answers"
              value={
                <span className="whitespace-pre-wrap break-words">
                  {request.practicalTaskResult.submission || "—"}
                </span>
              }
            />
          </CardSurface>

          <Collapsible open={showRawJson} onOpenChange={setShowRawJson}>
            <CardSurface variant="flat" padding="compact">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  View raw JSON
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showRawJson && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 pb-2 space-y-4">
                {request.mcqResult && (
                  <RawJsonBlock label="MCQ result summary" data={request.mcqResult} />
                )}
                {(request.evidencePackage as Record<string, unknown>)?.mcqQuestions && (
                  <RawJsonBlock
                    label="MCQ questions (learner view)"
                    data={(request.evidencePackage as Record<string, unknown>).mcqQuestions}
                  />
                )}
                {(request.evidencePackage as Record<string, unknown>)?.githubEvidence && (
                  <RawJsonBlock
                    label="GitHub evidence / classification"
                    data={(request.evidencePackage as Record<string, unknown>).githubEvidence}
                  />
                )}
                <RawJsonBlock label="Full evidence package" data={evidencePackageForDisplay(pkg)} />
              </CollapsibleContent>
            </CardSurface>
          </Collapsible>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader><CardTitle className="text-base">Decision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {request.status === "pending" ? (
                <>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Institution feedback (required for rejection)"
                  />
                  <Button className="w-full" disabled={busy} onClick={() => decide("approved")}>
                    <Check className="h-4 w-4 mr-1.5" />Approve
                  </Button>
                  <Button variant="destructive" className="w-full" disabled={busy} onClick={() => decide("rejected")}>
                    <X className="h-4 w-4 mr-1.5" />Reject
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Reviewed {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString() : "—"}
                  {request.institutionFeedback && (
                    <div className="mt-2 rounded-md border p-3">{request.institutionFeedback}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function RawJsonBlock({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

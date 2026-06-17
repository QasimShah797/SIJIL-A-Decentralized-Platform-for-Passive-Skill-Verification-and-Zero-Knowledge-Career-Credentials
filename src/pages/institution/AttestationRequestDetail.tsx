import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X } from "lucide-react";
import { useInstitutionAttestationRequest } from "@/hooks/useInstitutionAttestationRequests";
import {
  evidencePackageForDisplay,
  resolveCompetencyDomain,
  resolveCompetencyName,
  resolvePracticalTaskStatus,
  updateInstitutionAttestationRequest,
} from "@/lib/db/institution-attestation-requests";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export default function AttestationRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { request, loading, refresh } = useInstitutionAttestationRequest(id);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <AppShell role="institution">
        <div className="text-sm text-muted-foreground">Loading attestation request…</div>
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
          ? "Learner competency is wallet-ready."
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

  return (
    <AppShell role="institution">
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/institution/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />Back to dashboard
        </Button>
      </div>

      <PageHeader
        title="Institution Attestation Request"
        description="Full evidence package submitted after practical task pass."
        actions={<StatusBadge variant={request.status === "approved" ? "verified" : request.status === "rejected" ? "destructive" : "warning"}>{request.status}</StatusBadge>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Learner</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="Name" value={request.learnerName} />
              <Field label="Email" value={request.learnerEmail} />
              <Field label="Institution" value={request.institutionName} />
              <Field label="Student ID" value={pkg.learner.studentId ?? "—"} />
              <Field label="Program" value={pkg.learner.program ?? "—"} />
              <Field label="Batch" value={pkg.learner.batch ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Competency</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="Declared Competency" value={resolveCompetencyName(request)} />
              <Field label="Domain" value={resolveCompetencyDomain(request)} />
              <Field label="Declared at" value={pkg.competency.declaredAt ? new Date(pkg.competency.declaredAt).toLocaleString() : "—"} />
              <Field label="Submitted" value={new Date(request.submittedToInstitutionAt).toLocaleString()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Evidence summary</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="GitHub" value={request.githubEvidence.length} />
              <Field label="Moodle/LMS" value={request.moodleEvidence.length} />
              <Field label="Certificates" value={request.certificateEvidence.length} />
              <Field label="Peer reviews" value={request.peerReviewEvidence.length} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Practical task result</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field label="Title" value={request.practicalTaskResult.title} />
              <Field label="Attempt ID" value={request.practicalTaskResult.attemptId} />
              <Field label="Status" value={
                <span className="rounded-full border px-2 py-1 text-xs">
                  Practical Task {resolvePracticalTaskStatus(request.practicalTaskResult)}
                </span>
              } />
              <div>
                <div className="text-[11px] text-muted-foreground">Feedback</div>
                <div className="mt-1 rounded-md border bg-muted/30 p-3">{request.practicalTaskResult.feedback || "—"}</div>
              </div>
              {request.practicalTaskResult.criteriaResults?.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-2">Rubric criteria</div>
                  <div className="space-y-2">
                    {request.practicalTaskResult.criteriaResults.map((c, i) => (
                      <div key={i} className="rounded-md border p-2 text-xs">
                        <div className="font-medium">{String(c.criterion ?? `Criterion ${i + 1}`)}</div>
                        <div className="text-muted-foreground">{String(c.reason ?? c.notes ?? "")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-muted-foreground">Submission</div>
                <pre className="mt-1 rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{request.practicalTaskResult.submission || "—"}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Full evidence package</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs rounded-md border bg-muted/30 p-3 overflow-x-auto max-h-96 overflow-y-auto">
                {JSON.stringify(evidencePackageForDisplay(pkg), null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

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
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

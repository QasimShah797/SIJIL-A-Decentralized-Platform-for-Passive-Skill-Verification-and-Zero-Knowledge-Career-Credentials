import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X, MessageSquare, ShieldCheck, BadgeCheck, ChevronRight, ExternalLink } from "lucide-react";
import { getAttestations, subscribeAttestations, updateAttestation, AttestationRecord, AttestationStatus } from "@/lib/sijil-data";
import { toast } from "@/hooks/use-toast";

const statusVariant = (s: AttestationStatus) =>
  s === "Attestation Approved" ? "verified" :
  s === "Attestation Rejected" ? "destructive" :
  s === "Needs Clarification" ? "warning" : "info";

export default function AttestationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeAttestations(() => setTick((t) => t + 1)), []);
  const record: AttestationRecord | undefined = useMemo(
    () => getAttestations().find((a) => a.id === id),
    [id, tick],
  );
  const [remarks, setRemarks] = useState("");

  if (!record) {
    return (
      <AppShell role="institution">
        <PageHeader title="Record not found" />
        <Button variant="outline" onClick={() => navigate("/institution/queue")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to queue</Button>
      </AppShell>
    );
  }

  const decide = (next: AttestationStatus) => {
    if ((next === "Attestation Rejected" || next === "Needs Clarification") && !remarks.trim()) {
      toast({ title: "Remarks required", description: "Please add a note before this decision.", variant: "destructive" });
      return;
    }
    const readiness = next === "Attestation Approved" ? "Ready for Credential Issuance" : record.readiness;
    updateAttestation(record.id, { status: next, readiness, remarks: remarks.trim() || record.remarks });
    if (next === "Attestation Approved") toast({ title: "Attestation approved successfully", description: "Credential issuance ready." });
    if (next === "Attestation Rejected") toast({ title: "Attestation rejected", description: "Learner has been notified." });
    if (next === "Needs Clarification") toast({ title: "Clarification requested from learner" });
    setRemarks("");
  };

  return (
    <AppShell role="institution">
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/institution/queue")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to queue</Button>
      </div>

      <PageHeader
        title="Competency Attestation"
        description="Final official review of an evidence-backed competency record before credential issuance."
        actions={<StatusBadge variant={statusVariant(record.status)} icon={<ShieldCheck className="h-3 w-3" />}>{record.status}</StatusBadge>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* A. Learner Information */}
          <Section title="Learner Information">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Full Name" value={record.student} />
              <Field label="Student ID" value={record.studentId} />
              <Field label="Batch" value={record.batch} />
              <Field label="Program / Department" value={record.program} />
              <Field label="Institution Email" value={record.email} />
            </div>
          </Section>

          {/* B. Competency Overview */}
          <Section title="Competency Overview">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Skill / Competency" value={record.skill} />
              <Field label="Current Status" value={<StatusBadge variant={statusVariant(record.status)}>{record.status}</StatusBadge>} />
              <Field label="Validation Result" value={<StatusBadge variant={record.validationResult === "Passed" ? "verified" : "warning"}>{record.validationResult}</StatusBadge>} />
              <Field label="Last Evaluated" value={record.lastEvaluated} />
              <Field label="Reviews" value={record.reviewCount} />
              <Field label="Supporting Records" value={record.evidenceCount} />
              <Field label="Credential Readiness" value={<StatusBadge variant={record.readiness === "Ready for Credential Issuance" ? "verified" : record.readiness === "Ready for Attestation" ? "info" : "warning"}>{record.readiness}</StatusBadge>} />
            </div>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => navigate(`/institution/attestation/${record.id}/validation`)}>
                View Validation Trail <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </Section>

          {/* C. Supporting Evidence Summary */}
          <Section title="Supporting Evidence">
            <div className="rounded-md border divide-y">
              {record.evidence.map((e) => (
                <button key={e.id} onClick={() => toast({ title: e.name, description: `${e.type} · ${e.role}` })} className="w-full text-left px-4 py-3 hover:bg-muted/40 transition flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.type} · {e.date} · {e.role}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge variant="verified">{e.status}</StatusBadge>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* D. Practical Task Summary */}
          <Section title="Assessment Summary">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Task Title" value={record.task.title} />
              <Field label="Related Skill" value={record.task.relatedSkill} />
              <Field label="Attempt ID" value={record.task.attemptId} />
              <Field label="Submission Type" value={<StatusBadge variant={record.task.submissionType === "Manual" ? "info" : "warning"}>{record.task.submissionType}</StatusBadge>} />
              <Field label="Submitted At" value={record.task.submittedAt} />
              <Field label="Review Status" value={record.task.reviewStatus} />
            </div>
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Linked Artifact</div>
              {record.task.artifactSummary}
            </div>
          </Section>

          {/* E. Reviews & Endorsements */}
          <Section title="Reviews & Endorsements">
            <div className="space-y-2">
              {record.reviews.map((r, i) => (
                <div key={i} className="rounded-md border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{r.name} <span className="text-xs text-muted-foreground font-normal">· {r.type}</span></div>
                    <StatusBadge variant={r.outcome === "Endorsed" ? "verified" : r.outcome === "Approved with notes" ? "info" : "warning"}>{r.outcome}</StatusBadge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{r.feedback}</div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">{record.reviewCount} review(s) on record.</div>
            </div>
          </Section>
        </div>

        {/* F. Decision Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Attestation Decision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Remarks / Notes</label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Required for rejection or clarification." className="mt-1" />
              </div>
              <div className="grid gap-2">
                <Button onClick={() => decide("Attestation Approved")}><Check className="h-4 w-4 mr-1.5" />Approve & issue credential</Button>
                <Button variant="outline" onClick={() => decide("Needs Clarification")}><MessageSquare className="h-4 w-4 mr-1.5" />Request clarification</Button>
                <Button variant="destructive" onClick={() => decide("Attestation Rejected")}><X className="h-4 w-4 mr-1.5" />Reject</Button>
              </div>
              {record.remarks && (
                <div className="rounded-md bg-muted/40 p-3 text-xs">
                  <div className="uppercase text-muted-foreground mb-1">Last remarks</div>
                  {record.remarks}
                </div>
              )}
            </CardContent>
          </Card>

          {record.status === "Attestation Approved" && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-success" />Credential Readiness</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <StatusBadge variant="verified">Ready for Credential Issuance</StatusBadge>
                <p className="text-sm text-muted-foreground">This competency has been officially attested. Proceed to issuance handoff.</p>
                <Button className="w-full" onClick={() => navigate("/learner/wallet")}>Proceed to Credential Issuance Summary</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

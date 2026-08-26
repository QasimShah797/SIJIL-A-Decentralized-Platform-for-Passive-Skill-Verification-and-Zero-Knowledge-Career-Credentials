import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { ScoreboardStrip } from "@/components/sijil/ScoreboardStrip";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { CardSurface } from "@/components/sijil/CardSurface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  Check,
  X,
  Github,
  BookOpen,
  Award,
  Users,
} from "lucide-react";
import { useInstitutionAttestationRequests } from "@/hooks/useInstitutionAttestationRequests";
import { toast } from "@/hooks/use-toast";
import {
  formatMcqPercentageLabel,
  resolveCompetencyDomain,
  resolveCompetencyName,
  resolveLearnerEmail,
  resolveLearnerName,
  safeEvidenceCount,
  type InstitutionAttestationRequest,
} from "@/lib/db/institution-attestation-requests";

export default function InstitutionDashboard() {
  const navigate = useNavigate();
  const {
    requests,
    institutionName,
    loading,
    approveRequest,
    rejectRequest,
  } = useInstitutionAttestationRequests();

  const [rejectTarget, setRejectTarget] = useState<InstitutionAttestationRequest | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const rejected = requests.filter((r) => r.status === "rejected");

  const decide = async (
    record: InstitutionAttestationRequest,
    next: "approved" | "rejected",
    feedback?: string,
  ) => {
    try {
      if (next === "approved") {
        await approveRequest(record.id);
        toast({ title: "Attestation approved", description: "Credential issued to learner wallet." });
      } else {
        await rejectRequest(record.id, feedback?.trim() || undefined);
        toast({ title: "Attestation rejected", description: "Learner has been notified." });
      }
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectFeedback.trim()) {
      toast({
        title: "Feedback required",
        description: "Add institution feedback before rejecting.",
        variant: "destructive",
      });
      return;
    }
    setRejectBusy(true);
    try {
      await decide(rejectTarget, "rejected", rejectFeedback);
      setRejectTarget(null);
      setRejectFeedback("");
    } finally {
      setRejectBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell role="institution">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  return (
    <AppShell role="institution">
      <PageHeader
        title="Institution Attestation"
        description="Review evidence packages from learners at your institution and approve credentials for wallet issuance."
        actions={<Button onClick={() => navigate("/institution/queue")}>Open Attestation Queue</Button>}
      />

      <ScoreboardStrip
        className="mb-6"
        items={[
          { icon: ClipboardCheck, value: pending.length, label: "Pending", accent: "info" },
          { icon: CheckCircle2, value: approved.length, label: "Approved", accent: "success" },
          { icon: XCircle, value: rejected.length, label: "Rejected", accent: "warning" },
          { icon: BadgeCheck, value: institutionName, label: "Institution", accent: "neutral" },
        ]}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Pending Attestation Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              No pending attestation requests for {institutionName}.
            </div>
          ) : (
            <div className="divide-y">
              {pending.map((r) => (
                <div key={r.id} className="px-5 py-4 flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-sm font-medium">{resolveLearnerName(r)}</div>
                    <div className="text-xs text-muted-foreground">{resolveLearnerEmail(r)}</div>
                    <div className="text-xs">Institution: {r.institutionName || institutionName || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Submitted: {r.submittedToInstitutionAt
                        ? new Date(r.submittedToInstitutionAt).toLocaleString()
                        : "Not available"}
                    </div>

                    <CompetencyBlock request={r} />

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge variant="info">Pending</StatusBadge>
                      <span className="rounded-full border px-2 py-1 text-xs">
                        MCQ: {formatMcqPercentageLabel(r)}
                      </span>
                    </div>

                    <EvidenceChipCluster request={r} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" onClick={() => decide(r, "approved")}>
                      <Check className="h-3.5 w-3.5 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(r)}>
                      <X className="h-3.5 w-3.5 mr-1" />Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/institution/attestation-request/${r.id}`)}>
                      View evidence package
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <ListCard title="Recently Approved" empty="No approvals yet." rows={approved} onOpen={(id) => navigate(`/institution/attestation-request/${id}`)} statusVariant="verified" />
        <ListCard title="Recently Rejected" empty="No rejections yet." rows={rejected} onOpen={(id) => navigate(`/institution/attestation-request/${id}`)} statusVariant="destructive" />
      </div>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectFeedback("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject attestation request</DialogTitle>
            <DialogDescription>
              Provide feedback for {rejectTarget ? resolveLearnerName(rejectTarget) : "the learner"}. This is required before rejection.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectFeedback}
            onChange={(e) => setRejectFeedback(e.target.value)}
            placeholder="Institution feedback (required for rejection)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejectBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmReject()} disabled={rejectBusy}>
              {rejectBusy ? "Please wait…" : "Reject attestation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function EvidenceChipCluster({ request }: { request: InstitutionAttestationRequest }) {
  const chips = [
    { icon: Github, label: "GitHub", count: safeEvidenceCount(request.githubEvidence) },
    { icon: BookOpen, label: "Moodle", count: safeEvidenceCount(request.moodleEvidence) },
    { icon: Award, label: "Certificates", count: safeEvidenceCount(request.certificateEvidence) },
    { icon: Users, label: "Peer reviews", count: safeEvidenceCount(request.peerReviewEvidence) },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(({ icon: Icon, label, count }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          {label}: <span className="font-medium text-foreground tabular-nums">{count}</span>
        </span>
      ))}
    </div>
  );
}

function CompetencyBlock({ request }: { request: InstitutionAttestationRequest }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Declared Competency</p>
      <h3 className="font-semibold">{resolveCompetencyName(request)}</h3>
      <p className="text-sm text-muted-foreground">
        Domain: {resolveCompetencyDomain(request)}
      </p>
    </div>
  );
}

function ListCard({
  title, rows, empty, onOpen, statusVariant,
}: {
  title: string;
  rows: InstitutionAttestationRequest[];
  empty: string;
  onOpen: (id: string) => void;
  statusVariant: "info" | "verified" | "warning" | "destructive";
}) {
  return (
    <CardSurface variant="flat" padding="compact" className="overflow-hidden p-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">{empty}</div>
        ) : (
          <div className="divide-y">
            {rows.slice(0, 5).map((r) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left px-5 py-3 hover:bg-muted/40 transition flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {resolveLearnerName(r)} · <span className="text-muted-foreground font-normal">{resolveCompetencyName(r)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{resolveLearnerEmail(r)} · MCQ: {formatMcqPercentageLabel(r)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge variant={statusVariant}>{r.status}</StatusBadge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </CardSurface>
  );
}

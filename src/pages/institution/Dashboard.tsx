import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ClipboardCheck, CheckCircle2, XCircle, BadgeCheck, Check, X } from "lucide-react";
import { useInstitutionAttestationRequests } from "@/hooks/useInstitutionAttestationRequests";
import { toast } from "@/hooks/use-toast";
import {
  resolveCompetencyDomain,
  resolveCompetencyName,
  resolvePracticalTaskStatus,
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

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const rejected = requests.filter((r) => r.status === "rejected");

  const decide = async (
    record: InstitutionAttestationRequest,
    next: "approved" | "rejected",
  ) => {
    try {
      if (next === "approved") {
        await approveRequest(record.id);
        toast({ title: "Attestation approved", description: "Learner competency is wallet-ready." });
      } else {
        await rejectRequest(record.id, "Rejected by institution reviewer.");
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

  return (
    <AppShell role="institution">
      <PageHeader
        title="Institution Attestation"
        description="Review evidence packages from learners at your institution and approve credentials for wallet issuance."
        actions={<Button onClick={() => navigate("/institution/queue")}>Open Attestation Queue</Button>}
      />

      {loading && <div className="text-sm text-muted-foreground mb-4">Loading…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending" value={pending.length} tone="info" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Approved" value={approved.length} tone="verified" />
        <SummaryCard icon={<XCircle className="h-4 w-4" />} label="Rejected" value={rejected.length} tone="destructive" />
        <SummaryCard icon={<BadgeCheck className="h-4 w-4" />} label="Institution" value={institutionName} tone="verified" isText />
      </div>

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
                    <div className="text-sm font-medium">{r.learnerName}</div>
                    <div className="text-xs text-muted-foreground">{r.learnerEmail}</div>
                    <div className="text-xs">Institution: {r.institutionName}</div>

                    <CompetencyBlock request={r} />

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge variant="info">Pending</StatusBadge>
                      {resolvePracticalTaskStatus(r.practicalTaskResult) === "Passed" && (
                        <span className="rounded-full border px-2 py-1 text-xs">Practical Task Passed</span>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      GitHub: {r.githubEvidence.length} · Moodle: {r.moodleEvidence.length} · Certificates: {r.certificateEvidence.length} · Peer reviews: {r.peerReviewEvidence.length}
                    </div>
                    {r.practicalTaskResult?.feedback && (
                      <div className="text-xs text-muted-foreground line-clamp-3">
                        Feedback: {r.practicalTaskResult.feedback}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" onClick={() => decide(r, "approved")}>
                      <Check className="h-3.5 w-3.5 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => decide(r, "rejected")}>
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
    </AppShell>
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

function SummaryCard({
  icon, label, value, tone, isText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "info" | "verified" | "destructive" | "warning";
  isText?: boolean;
}) {
  const toneClass =
    tone === "verified" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-warning-foreground" : "text-info";
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${toneClass}`}>{icon}<span className="text-muted-foreground">{label}</span></div>
        <div className={`${isText ? "text-sm" : "text-2xl"} font-semibold mt-1 truncate`}>{value}</div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">{empty}</div>
        ) : (
          <div className="divide-y">
            {rows.slice(0, 5).map((r) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left px-5 py-3 hover:bg-muted/40 transition flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.learnerName} · <span className="text-muted-foreground font-normal">{resolveCompetencyName(r)}</span></div>
                  <div className="text-xs text-muted-foreground">{r.learnerEmail}</div>
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
    </Card>
  );
}

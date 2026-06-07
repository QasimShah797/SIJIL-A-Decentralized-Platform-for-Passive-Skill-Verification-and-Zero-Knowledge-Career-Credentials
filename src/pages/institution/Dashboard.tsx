import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ClipboardCheck, CheckCircle2, XCircle, MessageSquareWarning, BadgeCheck } from "lucide-react";
import { useAttestations } from "@/hooks/useAttestations";
import { AttestationRecord } from "@/lib/sijil-data";

export default function InstitutionDashboard() {
  const navigate = useNavigate();
  const { attestations: rows, loading } = useAttestations();

  const counts = {
    pending: rows.filter((r) => r.status === "Pending Attestation").length,
    approved: rows.filter((r) => r.status === "Attestation Approved").length,
    rejected: rows.filter((r) => r.status === "Attestation Rejected").length,
    clarification: rows.filter((r) => r.status === "Needs Clarification").length,
    ready: rows.filter((r) => r.readiness === "Ready for Credential Issuance").length,
  };

  const pending = rows.filter((r) => r.status === "Pending Attestation");
  const approved = rows.filter((r) => r.status === "Attestation Approved");
  const clarification = rows.filter((r) => r.status === "Needs Clarification");
  const issued = rows.filter((r) => r.readiness === "Ready for Credential Issuance");

  return (
    <AppShell role="institution">
      <PageHeader
        title="Institution Dashboard"
        description="Final official trust layer. Review evidence-backed competency records and issue verified credentials."
        actions={<Button onClick={() => navigate("/institution/queue")}>Open Attestation Queue</Button>}
      />

      {loading && <div className="text-sm text-muted-foreground mb-4">Loading…</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SummaryCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending Attestation" value={counts.pending} tone="info" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Approved" value={counts.approved} tone="verified" />
        <SummaryCard icon={<XCircle className="h-4 w-4" />} label="Rejected" value={counts.rejected} tone="destructive" />
        <SummaryCard icon={<MessageSquareWarning className="h-4 w-4" />} label="Needs Clarification" value={counts.clarification} tone="warning" />
        <SummaryCard icon={<BadgeCheck className="h-4 w-4" />} label="Credential Ready" value={counts.ready} tone="verified" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ListCard title="Pending Attestation Queue" empty="No records waiting." rows={pending} onOpen={(id) => navigate(`/institution/attestation/${id}`)} statusVariant="info" />
        <ListCard title="Recently Approved" empty="No approvals yet." rows={approved} onOpen={(id) => navigate(`/institution/attestation/${id}`)} statusVariant="verified" />
        <ListCard title="Needs Clarification" empty="Nothing to clarify." rows={clarification} onOpen={(id) => navigate(`/institution/attestation/${id}`)} statusVariant="warning" />
        <ListCard title="Recently Issued Credentials" empty="No credentials issued yet." rows={issued} onOpen={(id) => navigate(`/institution/attestation/${id}`)} statusVariant="verified" />
      </div>
    </AppShell>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "info" | "verified" | "destructive" | "warning" }) {
  const toneClass =
    tone === "verified" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-warning-foreground" : "text-info";
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${toneClass}`}>{icon}<span className="text-muted-foreground">{label}</span></div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, rows, empty, onOpen, statusVariant }: { title: string; rows: AttestationRecord[]; empty: string; onOpen: (id: string) => void; statusVariant: "info" | "verified" | "warning" | "destructive" }) {
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
                  <div className="text-sm font-medium truncate">{r.student} · <span className="text-muted-foreground font-normal">{r.skill}</span></div>
                  <div className="text-xs text-muted-foreground">{r.studentId} · {r.program}</div>
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

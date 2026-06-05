import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, FileText } from "lucide-react";
import { validationSummary, getAttestations } from "@/lib/sijil-data";

export default function InstitutionValidationTrail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const v = validationSummary;
  const record = getAttestations().find((r) => r.id === id);

  return (
    <AppShell role="institution">
      <PageHeader
        title="Validation Trail & Supporting Evidence"
        description="Read-only evidence trail used to support the institutional attestation decision."
        actions={
          <Button variant="outline" onClick={() => navigate(id ? `/institution/attestation/${id}` : "/institution/queue")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Attestation
          </Button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Skill</div>
            <div className="text-xl font-semibold mt-1">{record?.skill ?? v.skill}</div>
            {record && (
              <div className="text-xs text-muted-foreground mt-1">
                {record.student} · {record.studentId} · {record.batch}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge variant="verified">Result: {v.result}</StatusBadge>
              <StatusBadge variant="info">{v.status}</StatusBadge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 grid grid-cols-2 gap-4">
            <Stat label="Supporting Records" value={v.supportingRecords} />
            <Stat label="Reviews" value={v.reviewCount} />
            <Stat label="Last Evaluated" value={v.evaluatedOn} />
            <Stat label="Latest Activity" value={v.latestActivity} />
            <Stat label="Related Practical Task" value={v.task} />
            <Stat label="Current Status" value={v.status} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-2">Contributing sources</div>
            <div className="flex flex-wrap gap-2">
              {v.sources.map((s) => <StatusBadge key={s} variant="neutral">{s}</StatusBadge>)}
            </div>
            <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Trail re-evaluates when new records are imported by the learner.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Supporting evidence rows</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b">
            <div className="col-span-5">Source name</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Role in validation</div>
          </div>
          <div className="divide-y">
            {v.rows.map((r) => (
              <div key={r.name} className="grid grid-cols-12 px-6 py-3.5 text-sm">
                <div className="col-span-5 font-medium flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {r.name}
                </div>
                <div className="col-span-2 text-muted-foreground">{r.type}</div>
                <div className="col-span-2 text-muted-foreground">{r.date}</div>
                <div className="col-span-3">{r.role}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

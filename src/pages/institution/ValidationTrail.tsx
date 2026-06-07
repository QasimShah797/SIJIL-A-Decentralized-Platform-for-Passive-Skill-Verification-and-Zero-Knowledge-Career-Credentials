import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, FileText } from "lucide-react";
import { useAttestations } from "@/hooks/useAttestations";
import { buildValidationSummary, type ValidationSummary } from "@/lib/db/validation";
import { fetchDeclaredSkills } from "@/lib/db/skills";
import { supabase } from "@/integrations/supabase/client";

export default function InstitutionValidationTrail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { attestations, loading: attLoading } = useAttestations();
  const record = attestations.find((r) => r.id === id);
  const [v, setV] = useState<ValidationSummary | null>(null);

  useEffect(() => {
    if (!record?.skillId) return;
    (async () => {
      const { data: att } = await supabase.from("attestations").select("learner_user_id").eq("id", id).maybeSingle();
      if (!att?.learner_user_id) return;
      const skills = await fetchDeclaredSkills(att.learner_user_id);
      const skill = skills.find((s) => s.id === record.skillId);
      if (skill) setV(await buildValidationSummary(att.learner_user_id, skill));
    })();
  }, [record?.skillId, id]);

  if (attLoading || !v) {
    return (
      <AppShell role="institution">
        <div className="text-sm text-muted-foreground">Loading validation trail…</div>
      </AppShell>
    );
  }

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
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-2">Contributing sources</div>
            <div className="flex flex-wrap gap-2">
              {v.sources.map((s) => <StatusBadge key={s} variant="neutral">{s}</StatusBadge>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Evidence records</CardTitle>
          <Button variant="outline" size="sm"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        </CardHeader>
        <CardContent className="p-0">
          {v.rows.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">No evidence on file.</div>
          ) : (
            <div className="divide-y">
              {v.rows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center">
                  <div className="col-span-5 text-sm font-medium">{row.name}</div>
                  <div className="col-span-2"><StatusBadge variant="neutral">{row.type}</StatusBadge></div>
                  <div className="col-span-2 text-xs text-muted-foreground">{row.date}</div>
                  <div className="col-span-3 text-xs text-muted-foreground">{row.role}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

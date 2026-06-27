import { useMemo } from "react";
import { GraduationCap, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInstitutionAttestationRequests } from "@/hooks/useInstitutionAttestationRequests";
import {
  deriveInstitutionStudents,
  formatMcqPercentageLabel,
} from "@/lib/db/institution-attestation-requests";

export default function StudentManagement() {
  const { requests, loading, refresh, institutionName } = useInstitutionAttestationRequests();

  const students = useMemo(() => deriveInstitutionStudents(requests), [requests]);

  return (
    <AppShell role="institution">
      <PageHeader
        title="Student Management"
        description="Learners with MCQ practical submissions sent to your institution for attestation."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Student records are derived from <code className="text-xs">institution_attestation_requests</code> for
          {" "}{institutionName || "your institution"}. Provision new accounts through your institution onboarding flow when available.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            Learners with attestation submissions ({students.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading learners…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No learner attestation submissions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">Competency</th>
                    <th className="pb-2 pr-3 font-medium">Domain</th>
                    <th className="pb-2 pr-3 font-medium">MCQ %</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-3 font-medium">{s.name}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{s.email}</td>
                      <td className="py-3 pr-3">{s.competency}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{s.domain}</td>
                      <td className="py-3 pr-3">
                        {s.percentage != null ? `${s.percentage}%` : "Not available"}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge variant={s.status === "approved" ? "verified" : s.status === "rejected" ? "destructive" : "info"}>
                          {s.status}
                        </StatusBadge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {requests.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Recent attestation requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.slice(0, 5).map((request) => (
              <div key={request.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{request.competencyName || "Competency"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  MCQ result: {formatMcqPercentageLabel(request)} · Status: {request.status}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

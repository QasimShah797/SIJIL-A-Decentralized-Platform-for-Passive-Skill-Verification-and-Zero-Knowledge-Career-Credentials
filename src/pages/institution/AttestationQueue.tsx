import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Search } from "lucide-react";
import { useInstitutionAttestationRequests } from "@/hooks/useInstitutionAttestationRequests";
import {
  formatMcqPercentageLabel,
  resolveCompetencyDomain,
  resolveCompetencyName,
  resolveLearnerEmail,
  resolveLearnerName,
  safeEvidenceCount,
  type InstitutionAttestationRequest,
} from "@/lib/db/institution-attestation-requests";

const FILTERS = ["All", "pending", "approved", "rejected"] as const;

const variantFor = (status: InstitutionAttestationRequest["status"]) =>
  status === "approved" ? "verified"
    : status === "rejected" ? "destructive"
      : "info";

export default function AttestationQueue() {
  const navigate = useNavigate();
  const { requests, loading } = useInstitutionAttestationRequests();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    return requests
      .filter((r) => {
        const haystack = [
          resolveLearnerName(r),
          resolveLearnerEmail(r),
          resolveCompetencyName(r),
          resolveCompetencyDomain(r),
          r.institutionName,
        ].join(" ").toLowerCase();
        const matchQ = !q || haystack.includes(q.toLowerCase());
        const matchF = filter === "All" || r.status === filter;
        return matchQ && matchF;
      })
      .sort((a, b) => {
        const aTime = a.submittedToInstitutionAt ? new Date(a.submittedToInstitutionAt).getTime() : 0;
        const bTime = b.submittedToInstitutionAt ? new Date(b.submittedToInstitutionAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [requests, q, filter]);

  return (
    <AppShell role="institution">
      <PageHeader
        title="Attestation Queue"
        description="MCQ practical task submissions waiting for institutional review."
      />

      {loading && <div className="text-sm text-muted-foreground mb-4">Loading attestation requests…</div>}

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search learner, email, competency, or domain"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "All" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Competency</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>MCQ %</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/institution/attestation-request/${r.id}`)}
                >
                  <TableCell className="font-medium">{resolveLearnerName(r)}</TableCell>
                  <TableCell className="text-muted-foreground">{resolveLearnerEmail(r)}</TableCell>
                  <TableCell>{resolveCompetencyName(r)}</TableCell>
                  <TableCell className="text-muted-foreground">{resolveCompetencyDomain(r)}</TableCell>
                  <TableCell>{formatMcqPercentageLabel(r)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    GH {safeEvidenceCount(r.githubEvidence)} · LMS {safeEvidenceCount(r.moodleEvidence)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.submittedToInstitutionAt
                      ? new Date(r.submittedToInstitutionAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={variantFor(r.status)}>{r.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost">
                      Open
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No attestation requests match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

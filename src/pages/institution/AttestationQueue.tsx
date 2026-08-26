import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FilterBar } from "@/components/sijil/FilterBar";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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

const FILTERS = [
  { id: "All", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

const variantFor = (status: InstitutionAttestationRequest["status"]) =>
  status === "approved" ? "verified"
    : status === "rejected" ? "destructive"
      : "info";

const borderAccentFor = (status: InstitutionAttestationRequest["status"]) =>
  status === "approved"
    ? "border-l-success"
    : status === "rejected"
      ? "border-l-destructive"
      : "border-l-info";

export default function AttestationQueue() {
  const navigate = useNavigate();
  const { requests, loading } = useInstitutionAttestationRequests();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("All");

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

  if (loading) {
    return (
      <AppShell role="institution">
        <PageSkeleton rows={5} />
      </AppShell>
    );
  }

  return (
    <AppShell role="institution">
      <PageHeader
        title="Attestation Queue"
        description="MCQ practical task submissions waiting for institutional review."
      />

      <FilterBar
        className="mb-4"
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search learner, email, competency, or domain"
        filters={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
        activeFilter={filter}
        onFilterChange={setFilter}
      />

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
                  className={cn("cursor-pointer border-l-4", borderAccentFor(r.status))}
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

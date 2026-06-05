import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Search } from "lucide-react";
import { getAttestations, subscribeAttestations, AttestationRecord, AttestationStatus } from "@/lib/sijil-data";

const FILTERS: ("All" | AttestationStatus)[] = ["All", "Pending Attestation", "Attestation Approved", "Attestation Rejected", "Needs Clarification"];

const variantFor = (s: AttestationStatus) =>
  s === "Attestation Approved" ? "verified" :
  s === "Attestation Rejected" ? "destructive" :
  s === "Needs Clarification" ? "warning" : "info";

export default function AttestationQueue() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttestationRecord[]>(getAttestations());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [batch, setBatch] = useState<string>("All");

  useEffect(() => subscribeAttestations(() => setRows([...getAttestations()])), []);

  const batches = useMemo(() => {
    const set = new Set(rows.map((r) => r.batch));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        const matchQ = !q || `${r.student} ${r.studentId} ${r.skill} ${r.program} ${r.batch}`.toLowerCase().includes(q.toLowerCase());
        const matchF = filter === "All" || r.status === filter;
        const matchB = batch === "All" || r.batch === batch;
        return matchQ && matchF && matchB;
      })
      .sort((a, b) => a.batch.localeCompare(b.batch) || a.student.localeCompare(b.student));
  }, [rows, q, filter, batch]);

  return (
    <AppShell role="institution">
      <PageHeader
        title="Attestation Queue"
        description="Learner competency records waiting for an institutional decision."
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search learner, ID, skill or program" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f}</Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Batch:</span>
            <select
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {batches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Batch / Program</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>Validation</TableHead>
                <TableHead>Reviews</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/institution/attestation/${r.id}`)}>
                  <TableCell className="font-medium">{r.student}</TableCell>
                  <TableCell className="text-muted-foreground">{r.studentId}</TableCell>
                  <TableCell className="text-muted-foreground">{r.batch} · {r.program}</TableCell>
                  <TableCell>{r.skill}</TableCell>
                  <TableCell><StatusBadge variant={r.validationStatus === "Validated" ? "verified" : "warning"}>{r.validationStatus}</StatusBadge></TableCell>
                  <TableCell>{r.reviewCount}</TableCell>
                  <TableCell>{r.evidenceCount}</TableCell>
                  <TableCell className="text-muted-foreground">{r.submittedAt}</TableCell>
                  <TableCell><StatusBadge variant={variantFor(r.status)}>{r.status}</StatusBadge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost">Open Record <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">No records match.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

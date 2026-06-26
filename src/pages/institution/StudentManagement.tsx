import { useCallback, useEffect, useState } from "react";
import { UserPlus, Copy, Check, GraduationCap, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Field } from "@/components/sijil/Field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { isApiEnabled } from "@/services/api/client";
import {
  createInstitutionStudent,
  listInstitutionStudents,
  type InstitutionStudent,
} from "@/services/api/institution-students.api";

const EMPTY = {
  fullName: "",
  universityEmail: "",
  registrationNumber: "",
  department: "",
  program: "",
  batchSemester: "",
};

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export default function StudentManagement() {
  const [students, setStudents] = useState<InstitutionStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [lastActivationLink, setLastActivationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listInstitutionStudents();
      setStudents(rows);
    } catch (e) {
      toast({
        title: "Could not load students",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: keyof typeof EMPTY, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApiEnabled()) {
      toast({
        title: "Backend API unavailable",
        description: "Set VITE_API_BASE_URL and run the backend (npm run dev in backend/).",
        variant: "destructive",
      });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setLastActivationLink(null);
    setCopied(false);
    try {
      const created = await createInstitutionStudent(form);
      toast({
        title: "Student created",
        description: `${created.fullName} is provisioned as a Verified Student.`,
      });
      setForm(EMPTY);
      setLastActivationLink(created.activationLink);
      await load();
    } catch (err) {
      toast({
        title: "Could not create student",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!lastActivationLink) return;
    try {
      await navigator.clipboard.writeText(lastActivationLink);
      setCopied(true);
      toast({ title: "Activation link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <AppShell role="institution">
      <PageHeader
        title="Student Management"
        description="Create verified learner accounts for your institution. Students receive an activation link to set their password (Phase 3)."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {!isApiEnabled() && (
        <Card className="mb-6 border-warning/40 bg-warning-soft/30">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Backend API is not configured. Add <code className="text-xs">VITE_API_BASE_URL</code> to
            your frontend <code className="text-xs">.env</code> and start the backend server.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-primary" />
              Add student
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Full name" required>
                <Input
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  placeholder="Ayesha Khan"
                  autoComplete="off"
                />
              </Field>
              <Field label="University email" required hint="Official student email at your institution.">
                <Input
                  type="email"
                  value={form.universityEmail}
                  onChange={(e) => setField("universityEmail", e.target.value)}
                  placeholder="student@cust.edu.pk"
                  autoComplete="off"
                />
              </Field>
              <Field label="Registration number" required>
                <Input
                  value={form.registrationNumber}
                  onChange={(e) => setField("registrationNumber", e.target.value)}
                  placeholder="FA22-BCS-001"
                  autoComplete="off"
                />
              </Field>
              <Field label="Department" required>
                <Input
                  value={form.department}
                  onChange={(e) => setField("department", e.target.value)}
                  placeholder="Computer Science"
                />
              </Field>
              <Field label="Program" required>
                <Input
                  value={form.program}
                  onChange={(e) => setField("program", e.target.value)}
                  placeholder="BS Computer Science"
                />
              </Field>
              <Field label="Batch / semester" required>
                <Input
                  value={form.batchSemester}
                  onChange={(e) => setField("batchSemester", e.target.value)}
                  placeholder="Fall 2024 / Semester 5"
                />
              </Field>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creating…" : "Create verified student"}
              </Button>
            </form>

            {isLocalhost() && lastActivationLink && (
              <div className="mt-4 rounded-lg border border-info/30 bg-info/5 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Activation link (share with student)</p>
                <p className="text-xs text-muted-foreground break-all font-mono">{lastActivationLink}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" /> Copy activation link
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
              Students ({students.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading students…</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students provisioned yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Name</th>
                      <th className="pb-2 pr-3 font-medium">Email</th>
                      <th className="pb-2 pr-3 font-medium">Reg #</th>
                      <th className="pb-2 pr-3 font-medium">Program</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium">Activation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.userId} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-3 font-medium">{s.fullName}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{s.universityEmail}</td>
                        <td className="py-3 pr-3">{s.registrationNumber}</td>
                        <td className="py-3 pr-3">
                          <div>{s.program}</div>
                          <div className="text-xs text-muted-foreground">{s.department} · {s.batchSemester}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge variant="verified">{s.statusLabel}</StatusBadge>
                        </td>
                        <td className="py-3">
                          {s.accountActivated ? (
                            <StatusBadge variant="info">Activated</StatusBadge>
                          ) : (
                            <StatusBadge variant="warning">Pending activation</StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

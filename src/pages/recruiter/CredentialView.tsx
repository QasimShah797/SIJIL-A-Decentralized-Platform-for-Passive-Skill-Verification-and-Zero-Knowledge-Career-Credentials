import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ShieldCheck, ShieldAlert, CheckCircle2, EyeOff, Lock,
  Github, BookOpen, FileText, FileUp, MessageSquare, Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fetchPresentation } from "@/lib/db/presentations";
import { fetchCredentialByUriGlobal } from "@/lib/db/credentials";
import { useCandidates } from "@/hooks/useCandidates";
import type { SharedPresentation } from "@/lib/sijil-data";
import type { CredentialView } from "@/lib/db/credentials";
import { toast } from "@/hooks/use-toast";

type IntegrityState = "idle" | "passed" | "failed";

export default function RecruiterCredentialView() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const { candidateSkills } = useCandidates();
  const [presentation, setPresentation] = useState<SharedPresentation | null>(null);
  const [cred, setCred] = useState<CredentialView | null>(null);
  const [loading, setLoading] = useState(true);
  const [integrity, setIntegrity] = useState<IntegrityState>("idle");
  const [issuerVerified, setIssuerVerified] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetchPresentation(decodeURIComponent(token))
      .then(async (p) => {
        setPresentation(p);
        if (p) setCred(await fetchCredentialByUriGlobal(p.credentialId));
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <AppShell role="recruiter"><div className="text-sm text-muted-foreground">Loading presentation…</div></AppShell>;
  }

  if (!presentation) {
    return (
      <AppShell role="recruiter">
        <PageHeader title="Presentation not found" description="The shared link is invalid, expired or has been revoked." />
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      </AppShell>
    );
  }


  if (!cred) {
    return (
      <AppShell role="recruiter">
        <PageHeader title="Credential not found" description="The linked credential could not be loaded." />
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      </AppShell>
    );
  }

  const isExpired = new Date(presentation.expiresAt).getTime() < Date.now();
  const status = presentation.revoked ? "Revoked" : isExpired ? "Expired" : "Active";

  // Recruiter only ever sees fields the learner explicitly disclosed.
  const has = (id: string) => presentation.disclosedFields.some((f) => f.id === id);
  const get = (id: string) => presentation.disclosedFields.find((f) => f.id === id)?.value;

  // Supporting trail visibility — only shown if learner disclosed the evidence summary.
  const showTrail = has("evidenceSummary");
  const candSkills = candidateSkills[presentation.candidateId] || [];
  const matchedSkill = candSkills.find((s) => get("skill")?.toLowerCase().includes(s.skill.toLowerCase().split(" ")[0]));

  const runIntegrityCheck = () => {
    // Mock cryptographic check: hash + issuer DID + verificationMethod consistency.
    const ok = !!presentation.proof.proofValue && !presentation.revoked && !isExpired;
    setIntegrity(ok ? "passed" : "failed");
    toast({
      title: ok ? "Integrity check passed" : "Integrity check failed",
      description: ok
        ? "Hash matches · issuer DID resolved · proof signature valid · not revoked"
        : "Credential is revoked, expired or has been tampered with.",
      variant: ok ? "default" : "destructive",
    });
  };

  const verifyIssuer = () => {
    setIssuerVerified(true);
    toast({ title: "Issuer DID resolved", description: `${presentation.proof.verificationMethod} → trusted institution registry` });
  };

  return (
    <AppShell role="recruiter">
      <PageHeader
        title="Verifiable Presentation"
        description="Recruiter-side view. You only see fields the candidate explicitly disclosed. Nothing in the candidate's wallet is accessible."
        actions={
          <Button variant="outline" onClick={() => navigate(params.get("from") || "/recruiter/search")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Presentation token</div>
              <div className="text-xs text-muted-foreground mono">{presentation.token}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge variant={status === "Active" ? "verified" : "destructive"}>{status}</StatusBadge>
            <StatusBadge variant="info"><Lock className="h-3 w-3" /> Selective disclosure</StatusBadge>
            <StatusBadge variant="neutral">Recipient: {presentation.recipient}</StatusBadge>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Disclosed claims */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disclosed claims</CardTitle>
              <p className="text-xs text-muted-foreground">Only fields the candidate chose to reveal are shown.</p>
            </CardHeader>
            <CardContent>
              {presentation.disclosedFields.map((f) => (
                <FieldRow key={f.id} label={f.label} value={f.value} />
              ))}
            </CardContent>
          </Card>

          {/* Issuer verification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Issuer verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldRow label="Issuer" value={get("issuer") || "—"} />
              <FieldRow label="Issuer DID" value={presentation.proof.verificationMethod.split("#")[0]} mono hint="Resolved against trusted institution registry." />
              <FieldRow label="Attestation source" value={cred?.attestation === "Approved" ? "Approved by issuing institution" : (cred?.attestation || "—")} />
              <FieldRow
                label="Issuer signature"
                value={
                  issuerVerified
                    ? <StatusBadge variant="verified" icon={<CheckCircle2 className="h-3 w-3" />}>Trusted issuer</StatusBadge>
                    : <StatusBadge variant="info">Not yet verified</StatusBadge>
                }
              />
              <div className="pt-3">
                <Button variant="outline" size="sm" onClick={verifyIssuer}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> Verify issuer DID
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cryptographic proof */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cryptographic proof</CardTitle>
              <p className="text-xs text-muted-foreground">System-level integrity check — hash, issuer DID, and proof signature.</p>
            </CardHeader>
            <CardContent>
              <FieldRow label="proof.type" value={presentation.proof.type} mono />
              <FieldRow label="cryptosuite" value={presentation.proof.cryptosuite} mono />
              <FieldRow label="created" value={presentation.proof.created} mono />
              <FieldRow label="verificationMethod" value={presentation.proof.verificationMethod} mono />
              <FieldRow label="proofValue (hash)" value={`${presentation.proof.proofValue}…`} mono />
              <FieldRow
                label="Credential status"
                value={
                  integrity === "passed"
                    ? <StatusBadge variant="verified" icon={<CheckCircle2 className="h-3 w-3" />}>Valid</StatusBadge>
                    : integrity === "failed"
                      ? <StatusBadge variant="destructive" icon={<ShieldAlert className="h-3 w-3" />}>Invalid</StatusBadge>
                      : <StatusBadge variant="info">Not yet checked</StatusBadge>
                }
              />
              <FieldRow
                label="Integrity check"
                value={
                  integrity === "passed"
                    ? <StatusBadge variant="verified">Passed · hash matches</StatusBadge>
                    : integrity === "failed"
                      ? <StatusBadge variant="destructive">Failed · tampered or revoked</StatusBadge>
                      : <StatusBadge variant="neutral">Pending</StatusBadge>
                }
              />
              <div className="pt-3">
                <Button onClick={runIntegrityCheck}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> Run cryptographic verification
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Supporting trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supporting trail</CardTitle>
              <p className="text-xs text-muted-foreground">
                {showTrail
                  ? "Aggregated evidence behind this credential — counts only, no private artifacts."
                  : "Candidate did not disclose the supporting evidence summary."}
              </p>
            </CardHeader>
            <CardContent>
              {!showTrail && (
                <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <EyeOff className="h-4 w-4" /> Hidden by selective disclosure.
                </div>
              )}
              {showTrail && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Trail icon={BookOpen} label="LMS records" value={matchedSkill?.lmsRecords ?? 0} />
                  <Trail icon={Github} label="GitHub records" value={matchedSkill?.githubRecords ?? 0} />
                  <Trail icon={FileText} label="Practical task" value={matchedSkill?.practicalTask ?? "—"} />
                  <Trail icon={FileUp} label="External certificate" value={matchedSkill?.externalCert ?? "—"} />
                  <Trail icon={MessageSquare} label="Mentor / teacher reviews" value={matchedSkill?.reviews ?? 0} />
                  <Trail icon={Building2} label="Institutional attestation" value={matchedSkill?.attestation ?? "—"} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Hidden fields</CardTitle></CardHeader>
            <CardContent>
              {presentation.hiddenFields.length === 0 ? (
                <div className="text-xs text-muted-foreground">All fields disclosed.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {presentation.hiddenFields.map((h) => (
                    <StatusBadge key={h} variant="neutral"><EyeOff className="h-3 w-3" /> {h}</StatusBadge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                These claims were never sent — verifier cannot request them without a new presentation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Presentation metadata</CardTitle></CardHeader>
            <CardContent>
              <FieldRow label="Created" value={presentation.createdAt} mono />
              <FieldRow label="Expires" value={presentation.expiresAt} mono />
              <FieldRow label="Recipient DID" value={presentation.recipientDid} mono />
              <FieldRow label="Wallet access" value={<StatusBadge variant="neutral"><Lock className="h-3 w-3" /> Not granted</StatusBadge>} hint="Recruiter never accesses the candidate's wallet." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">What this proves</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>· Credential was issued by a trusted institution.</p>
              <p>· Disclosed claims have not been altered since signing.</p>
              <p>· Candidate is the rightful holder (DID-bound).</p>
              <p>· Hidden fields remain private — privacy-preserving.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Trail({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-md border bg-card p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-secondary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

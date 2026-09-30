import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, ShieldCheck, CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import { useCredentials } from "@/hooks/useLearnerData";
import { toast } from "@/hooks/use-toast";
import { mapLedgerStatusToBadge } from "@/lib/ledger-status";
import { verifyCredentialLedgerApi, type LedgerVerifyResult } from "@/services/api/ledger.api";

export default function CredentialProof() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { credentials, loading } = useCredentials();
  const c = credentials.find((x) => x.id === decodeURIComponent(id || ""));
  const [result, setResult] = useState<LedgerVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const proofHash = (c?.proof?.proofValue as string) ?? "—";
  const ledgerBadge = result ? mapLedgerStatusToBadge(result.status) : null;

  if (loading) {
    return (
      <AppShell role="learner">
        <PageSkeleton rows={3} />
      </AppShell>
    );
  }
  if (!c) {
    return (
      <AppShell role="learner">
        <EmptyState
          icon={ShieldAlert}
          title="Credential not found"
          description="This credential is not in your wallet."
          action={{ label: "Back to wallet", onClick: () => navigate("/learner/wallet") }}
        />
      </AppShell>
    );
  }

  const encodedId = encodeURIComponent(c.id);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const next = await verifyCredentialLedgerApi(c.id);
      setResult(next);
      const badge = mapLedgerStatusToBadge(next.status);
      toast({
        title: badge.label,
        description: `Ledger status ${badge.label}`,
        variant: next.status === "verified" ? "default" : "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AppShell role="learner">
      <PageHeader
        title="Credential Proof"
        description="Cryptographic proof object attached to this credential. Use this to independently verify integrity and issuer."
        breadcrumbs={[
          { label: "Wallet", href: "/learner/wallet" },
          { label: c.name, href: `/learner/credential/${encodedId}` },
          { label: "Proof" },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to details
          </Button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Proof object</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge variant="info" icon={<ShieldCheck className="h-3 w-3" />}>Verified</StatusBadge>
                  <StatusBadge variant="info">Tamper-Proof</StatusBadge>
                  <StatusBadge variant="info">Cryptographically Secured</StatusBadge>
                  <StatusBadge variant="neutral">Privacy-Preserving</StatusBadge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <FieldRow label="id" value={c.id} mono hint="Identifier of the credential this proof is bound to." />
              <FieldRow label="proof.type" value="DataIntegrityProof" mono hint="Proof envelope type from VC Data Integrity." />
              <FieldRow label="cryptosuite" value="eddsa-2022" mono hint="Cryptographic suite used for the signature." />
              <FieldRow label="created" value="2026-04-18T09:30:14Z" mono />
              <FieldRow label="verificationMethod" value={`${c.issuerDid}#key-1`} mono hint="Key reference (DID URL) used to verify the proof." />
              <FieldRow label="proofPurpose" value="assertionMethod" mono />
              <FieldRow label="issuer DID" value={c.issuerDid} mono hint="Issuer's Decentralized Identifier." />
              <FieldRow label="holder DID" value={c.holderDid} mono hint="Holder DID — credential is bound to this wallet." />
              <FieldRow
                label="proofValue (hash)"
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="mono">{proofHash}…</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(proofHash); toast({ title: "Hash copied" }); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                }
                hint="Truncated proof value (signature) over the canonicalized credential."
              />
              <FieldRow
                label="integrity check"
                value={
                  ledgerBadge
                    ? <StatusBadge variant={ledgerBadge.variant}>{ledgerBadge.label}</StatusBadge>
                    : <StatusBadge variant="info">Not yet run</StatusBadge>
                }
                hint="Result of recomputing the canonical hash and verifying the signature against the ledger."
              />
              {result?.anchorTxId ? (
                <FieldRow
                  label="anchorTxId"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span className="mono">{result.anchorTxId}</span>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(result.anchorTxId ?? ""); toast({ title: "Anchor tx id copied" }); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  }
                  hint="Ledger transaction id for this credential anchor."
                />
              ) : null}
              {result?.anchoredAt ? (
                <FieldRow
                  label="anchoredAt"
                  value={new Date(result.anchoredAt).toLocaleString()}
                  mono
                  hint="When this credential hash was written to the ledger."
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-success" />
                <span className="font-medium">Verify proof</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Resolves the issuer DID, fetches the verification key, and checks the credential hash against the ledger.
              </p>
              <Button
                className="w-full mt-4"
                onClick={() => void handleVerify()}
                disabled={verifying}
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />{verifying ? "Verifying…" : "Verify proof"}
              </Button>
              {ledgerBadge && (
                <div className="mt-4">
                  <StatusBadge variant={ledgerBadge.variant} icon={ledgerBadge.variant === "verified" ? <CheckCircle2 className="h-3 w-3" /> : undefined}>
                    {ledgerBadge.label}
                  </StatusBadge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">What this proves</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>· The credential was issued by <span className="text-foreground mono text-xs">{c.issuerDid}</span></p>
              <p>· Its contents have not been altered since signing.</p>
              <p>· It is bound to the holder DID in your wallet.</p>
              <p>· It can be presented selectively without revealing all fields.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

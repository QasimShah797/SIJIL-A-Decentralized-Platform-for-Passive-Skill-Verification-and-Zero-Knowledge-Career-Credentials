import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicVpApi, type PublicVpVerification } from "@/services/api/ssi.api";
import { mapLedgerStatusToBadge } from "@/lib/ledger-status";

export default function LearnerPresentationVerifyPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"missing" | "revoked" | null>(null);
  const [view, setView] = useState<PublicVpVerification | null>(null);

  useEffect(() => {
    if (!id) {
      setError("missing");
      setLoading(false);
      return;
    }
    let active = true;
    getPublicVpApi(id)
      .then((next) => {
        if (active) setView(next.verification);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "";
        setError(/410|revoked/i.test(message) ? "revoked" : "missing");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <PublicSurfaceLayout accent="strong" className="verify-surface">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Learner-signed presentation</p>
        <h1 className="text-2xl font-semibold">Holder possession plus issuer verification</h1>
        <p className="text-sm text-muted-foreground">
          This is not a bearer share link. Holder proof, issuer signature, and blockchain status are shown separately.
        </p>
        {loading ? <PageSkeleton rows={4} /> : error === "revoked" ? (
          <p className="text-sm text-destructive">
            This presentation was revoked by the learner. No presentation data is available.
          </p>
        ) : error || !view ? (
          <p className="text-sm text-destructive">Presentation not found or expired.</p>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Holder possession</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <StatusBadge variant={view.holderProof.ok ? "verified" : "destructive"}>
                  {view.holderProof.ok ? "Learner signature valid" : view.holderProof.reason ?? "invalid"}
                </StatusBadge>
                <p className="break-all font-mono text-xs">{view.holderDid}</p>
              </CardContent>
            </Card>
            {view.credentials.map((credential) => {
              const ledgerBadge = mapLedgerStatusToBadge(
                credential.blockchain.status,
                credential.blockchain.detail,
              );
              return (
                <Card key={credential.credentialId}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {credential.skill ?? `Credential ${credential.credentialId}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {credential.issuer ? (
                      <p className="break-all font-mono text-xs text-muted-foreground">{credential.issuer}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge variant={credential.holderBound ? "verified" : "destructive"}>
                        {credential.holderBound ? "Holder DID matches" : "Holder mismatch"}
                      </StatusBadge>
                      <StatusBadge variant={credential.issuerIntegrity.ok ? "verified" : "destructive"}>
                        {credential.issuerIntegrity.ok ? "Issuer signature valid" : "Issuer integrity failed"}
                      </StatusBadge>
                      <StatusBadge variant={credential.blockchain.ok ? "verified" : ledgerBadge.variant}>
                        {credential.blockchain.ok ? "Blockchain verified" : ledgerBadge.label}
                      </StatusBadge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PublicSurfaceLayout>
  );
}

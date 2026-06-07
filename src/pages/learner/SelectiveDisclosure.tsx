import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Copy, QrCode, Ban, EyeOff, Eye, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCredentials, useLearnerProfile } from "@/hooks/useLearnerData";
import { getCredentialDbId } from "@/lib/db/credentials";
import { savePresentationDb, revokePresentationDb } from "@/lib/db/presentations";
import { toast } from "@/hooks/use-toast";

export default function SelectiveDisclosure() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credentials, loading } = useCredentials();
  const { profile } = useLearnerProfile();
  const c = credentials.find((x) => x.id === decodeURIComponent(id || ""));

  const allFields = useMemo(() => {
    if (!c) return [];
    return [
      { id: "credentialName", label: "Credential name", value: c.name, default: true },
      { id: "skill", label: "Skill / achievement", value: c.skill, default: true },
      { id: "verification", label: "Verification status", value: c.verification, default: true },
      { id: "issuer", label: "Issuer", value: c.issuer, default: true },
      { id: "validFrom", label: "Issue date (validFrom)", value: c.validFrom.slice(0, 10), default: true },
      { id: "evidenceSummary", label: "Selected supporting record summary", value: `${c.supportingRecords} records`, default: false },
      { id: "studentId", label: "Student ID", value: profile?.studentId ?? "—", default: false },
      { id: "fullEvidence", label: "Full evidence history", value: "—", default: false },
      { id: "internalMeta", label: "Internal metadata", value: "—", default: false },
      { id: "reviews", label: "Review metadata", value: "—", default: false },
    ];
  }, [c, profile]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isRevoked, setIsRevoked] = useState(false);

  useEffect(() => {
    if (allFields.length) {
      setSelected(Object.fromEntries(allFields.map((f) => [f.id, f.default])));
    }
  }, [c?.id]);

  const toggle = (fieldId: string) => setSelected((s) => ({ ...s, [fieldId]: !s[fieldId] }));

  const token = useMemo(
    () => `pres-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [c?.id],
  );
  const shareUrl = `${window.location.origin}/recruiter/verify/${encodeURIComponent(token)}`;

  const visible = allFields.filter((f) => selected[f.id]);
  const hidden = allFields.filter((f) => !selected[f.id]);

  const persist = async () => {
    if (!user || !c || !profile) return;
    const dbId = await getCredentialDbId(c.id);
    if (!dbId) {
      toast({ title: "Could not save presentation", variant: "destructive" });
      return;
    }
    await savePresentationDb(user.id, dbId, user.id, {
      token,
      credentialId: c.id,
      candidateId: user.id,
      recipient: "Verifier",
      recipientDid: "did:web:verifier.example",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      revoked: false,
      disclosedFields: visible.map((f) => ({ id: f.id, label: f.label, value: f.value })),
      hiddenFields: hidden.map((f) => f.label),
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-2022",
        created: new Date().toISOString(),
        verificationMethod: `${c.issuerDid}#key-1`,
        proofValue: `0x${token.replace(/-/g, "").slice(0, 32).toUpperCase()}`,
      },
    });
    toast({ title: "Presentation saved", description: "Share link is ready for recruiters." });
  };

  const revoke = async () => {
    await revokePresentationDb(token);
    setIsRevoked(true);
    toast({ title: "Presentation revoked" });
  };

  if (loading) {
    return <AppShell role="learner"><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  if (!c) {
    return (
      <AppShell role="learner">
        <PageHeader title="Credential not found" />
        <Button onClick={() => navigate("/learner/wallet")}>Back to wallet</Button>
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Selective Disclosure"
        description="Choose exactly what a verifier sees. Hidden fields remain bound to the credential but are not revealed."
        actions={
          <Button variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to details
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Fields to disclose</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {allFields.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{f.value}</div>
                </div>
                <Switch checked={!!selected[f.id]} onCheckedChange={() => toggle(f.id)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Verifier preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/30 p-4 space-y-2 mb-4">
              {visible.length === 0 ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><EyeOff className="h-4 w-4" />Nothing selected to disclose</div>
              ) : visible.map((f) => (
                <div key={f.id} className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-medium text-right">{f.value}</span>
                </div>
              ))}
              {hidden.length > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />{hidden.length} field(s) hidden from verifier
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground mb-2">Share link</div>
            <div className="flex gap-2 mb-4">
              <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">{shareUrl}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "Link copied" }); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={persist} disabled={isRevoked}><ExternalLink className="h-4 w-4 mr-1.5" />Save & share</Button>
              <Button variant="outline" onClick={() => toast({ title: "QR code", description: "QR generation coming soon" })}><QrCode className="h-4 w-4 mr-1.5" />QR</Button>
              <Button variant="destructive" onClick={revoke} disabled={isRevoked}><Ban className="h-4 w-4 mr-1.5" />Revoke</Button>
            </div>
            {isRevoked && <StatusBadge variant="destructive" className="mt-3">Revoked</StatusBadge>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

import { useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Copy, QrCode, Ban, EyeOff, Eye, ExternalLink } from "lucide-react";
import { credentials, savePresentation, revokePresentation, seededPresentations } from "@/lib/sijil-data";
import { toast } from "@/hooks/use-toast";

const allFields = [
  { id: "credentialName", label: "Credential name", value: "Verified Full-Stack Development Credential", default: true },
  { id: "skill", label: "Skill / achievement", value: "React.js + Node.js", default: true },
  { id: "verification", label: "Verification status", value: "Verified", default: true },
  { id: "issuer", label: "Issuer", value: "COMSATS University Islamabad", default: true },
  { id: "validFrom", label: "Issue date (validFrom)", value: "2026-04-18", default: true },
  { id: "evidenceSummary", label: "Selected supporting record summary", value: "4 records (LMS, GitHub, Practical, External)", default: false },
  { id: "studentId", label: "Student ID", value: "FA22-BSE-114", default: false },
  { id: "fullEvidence", label: "Full evidence history", value: "—", default: false },
  { id: "internalMeta", label: "Internal metadata", value: "—", default: false },
  { id: "reviews", label: "Review metadata", value: "3 endorsements", default: false },
];

export default function SelectiveDisclosure() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = credentials.find((x) => x.id === decodeURIComponent(id || "")) || credentials[0];
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(allFields.map((f) => [f.id, f.default]))
  );
  const [isRevoked, setIsRevoked] = useState(false);
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const token = useMemo(() => {
    const seeded = Object.values(seededPresentations).find((p) => p.credentialId === c.id);
    return seeded?.token ?? `pres-${Math.random().toString(36).slice(2, 10)}`;
  }, [c.id]);
  const shareUrl = `${window.location.origin}/recruiter/verify/${encodeURIComponent(token)}`;

  const visible = allFields.filter((f) => selected[f.id]);
  const hidden = allFields.filter((f) => !selected[f.id]);

  const persist = () => {
    savePresentation({
      token,
      credentialId: c.id,
      candidateId: "cand-1",
      recipient: "TalentBridge HR",
      recipientDid: "did:web:verifier.talentbridge.io",
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
        proofValue: "0xA91F3C77B82D4E19D55C031F92B7E04AC8",
      },
    });
    setIsRevoked(false);
  };

  return (
    <AppShell role="learner">
      <PageHeader
        title="Selective Disclosure"
        description="Choose exactly which claims to reveal. Hidden fields are never sent to the verifier — Presentation Exchange style."
        actions={
          <Button variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to credential
          </Button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: requested + selection */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification request</CardTitle>
              <p className="text-sm text-muted-foreground">
                Recipient: <span className="text-foreground font-medium">TalentBridge HR</span> ·
                <span className="mono text-xs ml-1">did:web:verifier.talentbridge.io</span>
              </p>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge variant="info">Requested claim: skill</StatusBadge>
                <StatusBadge variant="info">Requested claim: verification</StatusBadge>
                <StatusBadge variant="info">Requested claim: issuer</StatusBadge>
                <StatusBadge variant="neutral">Optional: supporting evidence summary</StatusBadge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Shareable fields</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {allFields.map((f) => (
                  <div key={f.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {selected[f.id] ? <Eye className="h-3.5 w-3.5 text-success" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        {f.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.value}</div>
                    </div>
                    <Switch checked={selected[f.id]} onCheckedChange={() => toggle(f.id)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: preview & controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipient preview</CardTitle>
              <p className="text-xs text-muted-foreground">What the verifier will actually see.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[11px] text-muted-foreground mb-2">Disclosed claims</div>
                <div className="space-y-1.5 text-sm">
                  {visible.length === 0 && <div className="text-xs text-muted-foreground italic">Nothing selected.</div>}
                  {visible.map((f) => (
                    <div key={f.id} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="font-medium text-right">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                  <EyeOff className="h-3 w-3" /> Not disclosed
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hidden.map((f) => <StatusBadge key={f.id} variant="neutral">{f.label}</StatusBadge>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="rounded-md bg-secondary p-3 mono text-xs break-all">{shareUrl}</div>
              {isRevoked && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  This presentation is revoked. Recruiters opening the link will see a revoked status.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(shareUrl); toast({ title: "Link copied" }); }}>
                  <Copy className="h-4 w-4 mr-1.5" />Copy link
                </Button>
                <Button variant="outline" onClick={() => toast({ title: "QR code generated", description: "Scan from a recruiter device." })}>
                  <QrCode className="h-4 w-4 mr-1.5" />QR code
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => navigate(`/recruiter/verify/${encodeURIComponent(token)}?from=${encodeURIComponent(`/learner/credential/${encodeURIComponent(c.id)}/share`)}`)}>
                  <ExternalLink className="h-4 w-4 mr-1.5" />Recipient preview
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => { revokePresentation(token); setIsRevoked(true); toast({ title: "Link revoked", variant: "destructive" }); }}
                >
                  <Ban className="h-4 w-4 mr-1.5" />Revoke
                </Button>
              </div>
              <Button className="w-full" onClick={() => { persist(); toast({ title: "Share settings updated", description: "Recruiter will only see disclosed claims." }); }}>
                Update share settings
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppShell>
  );
}

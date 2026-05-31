import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { InfoHint } from "@/components/sijil/InfoHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ShieldCheck, Eye, Share2, Settings2, KeyRound } from "lucide-react";
import { credentials, learnerProfile } from "@/lib/sijil-data";

export default function WalletPage() {
  const navigate = useNavigate();
  return (
    <AppShell role="learner">
      <PageHeader
        title="Wallet"
        description="Your decentralized credential wallet. Credentials are bound to your holder DID — only you can present and disclose them."
        actions={<Button variant="outline"><Settings2 className="h-4 w-4 mr-1.5" />Wallet settings</Button>}
      />

      {/* Ownership panel */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="credential-card text-primary-foreground p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                <span className="font-medium">SIJIL Wallet</span>
              </div>
              <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>Learner-controlled</StatusBadge>
            </div>
            <div className="mt-6">
              <div className="text-xs opacity-70 flex items-center gap-1.5">
                Holder DID <InfoHint text="Decentralized Identifier — only the wallet holding the corresponding key material can present these credentials." />
              </div>
              <div className="mono text-sm break-all mt-1">{learnerProfile.did}</div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6">
              <Stat dark label="Total credentials" value={credentials.length} />
              <Stat dark label="Verified" value={credentials.filter(c => c.verification === "Verified").length} />
              <Stat dark label="Supporting records" value={credentials.reduce((a, c) => a + c.supportingRecords, 0)} />
            </div>
          </div>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-success" /> Key material
            </div>
            <div className="text-xs text-muted-foreground mt-1">Ed25519 — generated locally, never exported.</div>
            <div className="mt-3 space-y-2 text-xs">
              <Row k="Verification key" v="z6Mk…HeZJF" />
              <Row k="Suite" v="DataIntegrityProof" />
              <Row k="Backup" v="Recovery phrase set" />
            </div>
            <Button size="sm" variant="outline" className="w-full mt-4">Manage keys</Button>
          </CardContent>
        </Card>
      </div>

      {/* Credentials grid */}
      <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Credentials</h2>
      <div className="grid md:grid-cols-2 gap-5">
        {credentials.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <div className="credential-card text-primary-foreground px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] opacity-70 mono truncate">{c.id}</div>
                  <div className="font-semibold mt-1">{c.name}</div>
                </div>
                <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>{c.verification}</StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.type.map((t) => (
                  <span key={t} className="text-[10px] mono px-2 py-0.5 rounded bg-primary-foreground/10 border border-primary-foreground/15">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">issuer <InfoHint text="The entity that signed and issued this credential." /></div>
                  <div>{c.issuer}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">issuer DID <InfoHint text="DID of the issuer used to verify the credential signature." /></div>
                  <div className="mono text-xs truncate">{c.issuerDid}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">validFrom</div>
                  <div className="text-xs">{c.validFrom}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">attestation <InfoHint text="Institutional attestation status recorded alongside the credential." /></div>
                  <StatusBadge variant={c.attestation === "Approved" ? "verified" : "info"}>{c.attestation}</StatusBadge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-3">{c.supportingRecords} supporting records · skill: {c.skill}</div>

              <div className="grid grid-cols-3 gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}`)}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />Details
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/proof`)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Proof
                </Button>
                <Button size="sm" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/share`)}>
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />Share
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, dark }: { label: string; value: any; dark?: boolean }) {
  return (
    <div>
      <div className={`text-[11px] ${dark ? "opacity-70" : "text-muted-foreground"}`}>{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

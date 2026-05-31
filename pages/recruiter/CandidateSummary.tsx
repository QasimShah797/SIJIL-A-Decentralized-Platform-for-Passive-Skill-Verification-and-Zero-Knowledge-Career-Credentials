import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, ArrowRight, Lock, Building2 } from "lucide-react";
import { candidates, candidateSkills, seededPresentations, getPeerReviews, computeTrustSignals } from "@/lib/sijil-data";
import { ReviewCard } from "@/pages/learner/PeerReviews";

export default function CandidateSummary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = candidates.find((x) => x.id === id) || candidates[0];
  const skills = candidateSkills[c.id] || [];
  const peerReviews = getPeerReviews();
  const trust = computeTrustSignals(peerReviews);

  // Find any active presentation the candidate has shared with verifiers
  const presentation = Object.values(seededPresentations).find((p) => p.candidateId === c.id);

  return (
    <AppShell role="recruiter">
      <PageHeader
        title="Candidate Verification Summary"
        description="Evidence-backed view. SIJIL aggregates trust signals — it does not assign expert/intermediate labels."
        actions={<Button variant="outline" onClick={() => navigate("/recruiter/search")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to search</Button>}
      />

      <Card className="mb-6">
        <CardContent className="p-6 flex items-start gap-5">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
            {c.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{c.name}</h2>
              <StatusBadge variant={c.attestation === "Approved" ? "verified" : "warning"}>Attestation: {c.attestation}</StatusBadge>
              <StatusBadge variant="neutral"><Lock className="h-3 w-3" /> Wallet not accessible</StatusBadge>
            </div>
            <div className="text-sm text-muted-foreground">{c.institution}</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <Stat label="Verified skills" value={skills.length} />
              <Stat label="Credentials" value={c.credentialCount} />
              <Stat label="Evidence records" value={c.evidence} />
              <Stat label="Reviews" value={c.reviews} />
              <Stat label="Shared presentations" value={presentation ? 1 : 0} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Verified skills</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {skills.map((s) => (
                  <div key={s.skill} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{s.skill}</div>
                      <StatusBadge variant={s.attestation === "Approved" ? "verified" : "warning"}>
                        {s.attestation === "Approved" ? "Fully attested" : "Partially verified"}
                      </StatusBadge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs">
                      <Mini k="Reviews" v={s.reviews} />
                      <Mini k="Evidence" v={s.evidence} />
                      <Mini k="LMS" v={s.lmsRecords} />
                      <Mini k="GitHub" v={s.githubRecords} />
                      <Mini k="External cert" v={s.externalCert} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2 mono">
                      Attested by {s.attestationSource} · {s.attestationDid}
                    </div>
                  </div>
                ))}
                {skills.length === 0 && (
                  <div className="p-6 text-sm text-muted-foreground">No skills published.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Verifiable presentation</CardTitle></CardHeader>
            <CardContent>
              {presentation ? (
                <>
                  <FieldRow label="Token" value={presentation.token} mono />
                  <FieldRow label="Recipient" value={presentation.recipient} />
                  <FieldRow label="Recipient DID" value={presentation.recipientDid} mono />
                  <FieldRow label="Disclosed claims" value={`${presentation.disclosedFields.length} of ${presentation.disclosedFields.length + presentation.hiddenFields.length}`} />
                  <FieldRow label="Status" value={<StatusBadge variant={presentation.revoked ? "destructive" : "verified"}>{presentation.revoked ? "Revoked" : "Active"}</StatusBadge>} />
                  <FieldRow label="proof" value={<StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>Verifiable proof present</StatusBadge>} />
                  <div className="flex gap-2 pt-4">
                    <Button onClick={() => navigate(`/recruiter/verify/${encodeURIComponent(presentation.token)}?from=${encodeURIComponent(`/recruiter/candidate/${c.id}`)}`)}>
                      Open & verify presentation <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Verification happens on the recruiter side. You will see only fields the candidate disclosed — wallet contents remain private.
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  This candidate has not shared a verifiable presentation with you yet. Request one to verify their credential.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Peer reviews & trust signals</CardTitle>
              <p className="text-xs text-muted-foreground">
                Reviews show reviewer relationship, context source, verification status, trust weight, linked evidence and comment. SIJIL does not assign a final skill level — interpret the evidence yourself.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 px-6 py-4 border-b">
                <Mini k="Total" v={trust.total} />
                <Mini k="Verified context" v={trust.verifiedContext} />
                <Mini k="Imported" v={trust.imported} />
                <Mini k="SIJIL" v={trust.sijil} />
                <Mini k="High trust" v={trust.highTrust} />
                <Mini k="Pending" v={trust.pending} />
              </div>
              <div className="divide-y">
                {peerReviews.slice(0, 5).map((r) => <ReviewCard key={r.id} r={r} />)}
                {peerReviews.length === 0 && (
                  <div className="p-6 text-sm text-muted-foreground">No peer reviews available.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Attestation source</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{c.institution}</span>
              </div>
              <div className="text-xs text-muted-foreground mono mt-1">{skills[0]?.attestationDid || "did:web:issuer"}</div>
              <StatusBadge variant="verified" className="mt-3">Approved</StatusBadge>
              <p className="text-xs text-muted-foreground mt-3">
                The institution issued and attested this learner's credentials — not a self-claim.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Privacy notice</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>· You only see fields the candidate explicitly disclosed.</p>
              <p>· You cannot browse the candidate's wallet.</p>
              <p>· Hidden fields stay hidden — no requests bypass selective disclosure.</p>
              <p>· Verification runs locally against the issuer DID.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}
function Mini({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className="text-xs font-medium mt-0.5">{v}</div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { FieldRow } from "@/components/sijil/FieldRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, ShieldCheck, Download, FileText, Github, BookOpen, FileUp, MessageSquare, ExternalLink } from "lucide-react";
import { credentials } from "@/lib/sijil-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type RepoEvidence = {
  id: string;
  repo_name: string;
  full_name: string;
  github_url: string;
  primary_language: string | null;
  last_updated: string | null;
};

function tokensFromSkill(skill: string): string[] {
  return skill.split(/\s*[+&/]\s*/).map((s) => s.trim()).filter(Boolean);
}

function languageMatches(lang: string | null, skillTokens: string[]): boolean {
  if (!lang) return false;
  const l = lang.toLowerCase();
  return skillTokens.some((t) => {
    const n = t.toLowerCase();
    return n === l || n.includes(l) || l.includes(n.split(/[ .]/)[0]);
  });
}

export default function CredentialDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const c = credentials.find((x) => x.id === decodeURIComponent(id || "")) || credentials[0];
  const [repoEvidence, setRepoEvidence] = useState<RepoEvidence[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("github_repos")
        .select("id, repo_name, full_name, github_url, primary_language, last_updated")
        .eq("user_id", user.id);
      const tokens = tokensFromSkill(c.skill);
      setRepoEvidence((data ?? []).filter((r) => languageMatches(r.primary_language, tokens)));
    })();
  }, [user, c.skill]);

  const totalSupporting = repoEvidence.length;

  return (
    <AppShell role="learner">
      <PageHeader
        title="Credential Details"
        description="Full record of why this credential exists, its supporting evidence, and its technical metadata."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/learner/wallet")}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to wallet</Button>
            <Button variant="outline" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/proof`)}><ShieldCheck className="h-4 w-4 mr-1.5" />View proof</Button>
            <Button onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/share`)}><Share2 className="h-4 w-4 mr-1.5" />Share</Button>
          </>
        }
      />

      <Card className="overflow-hidden mb-6">
        <div className="credential-card text-primary-foreground p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-xs opacity-70 mono truncate">{c.id}</div>
              <h2 className="text-2xl font-semibold mt-1">{c.name}</h2>
              <div className="text-sm opacity-80 mt-1">Issued by {c.issuer}</div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {c.type.map((t) => (
                  <span key={t} className="text-[11px] mono px-2 py-0.5 rounded bg-primary-foreground/10 border border-primary-foreground/15">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>{c.verification}</StatusBadge>
              <StatusBadge variant={c.attestation === "Approved" ? "verified" : "info"}>Attestation: {c.attestation}</StatusBadge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Section title="Credential overview">
            <FieldRow label="id" value={c.id} mono hint="Globally unique URN identifying this credential." />
            <FieldRow label="type" value={c.type.join(", ")} mono />
            <FieldRow label="issuer" value={c.issuer} />
            <FieldRow label="issuer DID" value={c.issuerDid} mono hint="Used to resolve and verify the issuer's signing key." />
            <FieldRow label="validFrom" value={c.validFrom} mono />
            <FieldRow label="credentialSubject" value={`{ id: "${c.holderDid}", achievement: "${c.skill}" }`} mono />
            <FieldRow label="related skill" value={c.skill} />
          </Section>

          <Section title="Supporting records">
            {repoEvidence.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground text-center">
                No linked evidence yet. Sync GitHub to link repositories matching {c.skill}.
              </div>
            ) : (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  GitHub repositories matched to {c.skill} ({repoEvidence.length})
                </div>
                {repoEvidence.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 border-border/60">
                    <div className="h-9 w-9 rounded-md bg-secondary flex items-center justify-center">
                      <Github className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={r.github_url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline inline-flex items-center gap-1 truncate">
                        {r.repo_name}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.full_name} · {r.primary_language ?? "Language not detected"}
                        {r.last_updated && ` · Updated ${new Date(r.last_updated).toLocaleDateString()}`}
                      </div>
                    </div>
                    <StatusBadge variant="verified">Evidence Linked</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Reviews & endorsements">
            <Endorsement who="Dr. S. Aslam" role="Mentor" text={`Demonstrated solid grasp of ${c.skill} concepts and applied practice.`} />
            <Endorsement who="A. Raza" role="Teacher" text="Consistently strong submissions across the module." />
            <div className="text-xs text-muted-foreground pt-1">Review count = 3</div>
          </Section>

          <Section title="Linked assessment records">
            <Assessment title={`${c.skill} Skill Check`} date="19 Apr 2026" />
            <Assessment title="Practical Task Quiz" date="14 Apr 2026" />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Credential metadata">
            <FieldRow label="credentialSchema" value="https://schemas.sijil.dev/achievement/v2.json" mono />
            <FieldRow label="credentialStatus" value="StatusList2021Entry · index 142" mono hint="Revocation reference using a status list entry." />
            <FieldRow label="proof" value="DataIntegrityProof (eddsa-2022)" mono />
            <FieldRow label="evidence" value={`${totalSupporting} supporting records`} />
            <FieldRow label="alignment" value="Open Badges 3.0 → Achievement" mono />
            <FieldRow label="criteria" value="Pass practical + 3 supporting records + attestation" />
          </Section>

          <Card>
            <CardContent className="p-4 space-y-2">
              <Button variant="outline" className="w-full justify-start"><Download className="h-4 w-4 mr-2" />Export as VC JSON-LD</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/proof`)}>
                <ShieldCheck className="h-4 w-4 mr-2" />View proof
              </Button>
              <Button className="w-full justify-start" onClick={() => navigate(`/learner/credential/${encodeURIComponent(c.id)}/share`)}>
                <Share2 className="h-4 w-4 mr-2" />Share with selective disclosure
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function Evidence({ icon: Icon, title, sub }: any) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0 border-border/60">
      <div className="h-9 w-9 rounded-md bg-secondary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <StatusBadge variant="info">Linked</StatusBadge>
    </div>
  );
}

function Endorsement({ who, role, text }: { who: string; role: string; text: string }) {
  return (
    <div className="flex gap-3 py-2.5 border-b last:border-0 border-border/60">
      <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-sm"><span className="font-medium">{who}</span> · <span className="text-muted-foreground">{role}</span></div>
        <div className="text-xs text-muted-foreground mt-0.5">{text}</div>
      </div>
    </div>
  );
}

function Assessment({ title, date }: { title: string; date: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-border/60">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">Supporting Assessment Record · {date}</div>
      </div>
      <StatusBadge variant="verified">Completed</StatusBadge>
    </div>
  );
}

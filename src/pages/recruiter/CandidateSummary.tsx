import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/sijil/AppShell";

import { StatusBadge } from "@/components/sijil/StatusBadge";

import { EmptyState } from "@/components/sijil/EmptyState";

import { PageSkeleton } from "@/components/sijil/SkeletonLoader";

import { RecruiterSkillEvidenceItem, recruiterSkillCards } from "@/components/recruiter/RecruiterSkillEvidence";

import { Accordion } from "@/components/ui/accordion";

import { Button } from "@/components/ui/button";

import { ArrowLeft, Lock, ShieldCheck, Wallet } from "lucide-react";

import { fetchPeerReviews } from "@/lib/db/peer-reviews";

import { fetchCandidateDetail } from "@/lib/db/shared-credentials";

import { computeTrustSignals } from "@/lib/sijil-data";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PeerReview } from "@/lib/sijil-data";

import { dedupeLatestSharedCredentials, type CandidateDetailView, type SharedCredentialView } from "@/lib/shared-presentation";



const IDENTITY_FIELD_IDS = new Set([

  "institution",

  "institutionName",

  "institution_name",

  "issuer",

  "program",

  "department",

  "careerGoal",

  "career_goal",

  "city",

  "country",

  "cityCountry",

  "city_country",

  "location",

  "role",

  "track",

]);



export default function CandidateSummary() {

  const { id } = useParams();

  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<CandidateDetailView | null>(null);

  const [peerReviews, setPeerReviews] = useState<PeerReview[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    if (!id) {

      setCandidate(null);

      setLoading(false);

      return;

    }



    let active = true;

    setLoading(true);

    setError(null);



    Promise.all([fetchCandidateDetail(id), fetchPeerReviews(id)])

      .then(([nextCandidate, reviews]) => {

        if (!active) return;

        setCandidate(nextCandidate);

        setPeerReviews(reviews);

      })

      .catch((nextError: unknown) => {

        if (!active) return;

        setCandidate(null);

        setError(nextError instanceof Error ? nextError.message : "Could not load candidate.");

      })

      .finally(() => {

        if (active) setLoading(false);

      });



    return () => {

      active = false;

    };

  }, [id]);



  const trust = computeTrustSignals(peerReviews);

  const sharedCredentials = useMemo(

    () => dedupeLatestSharedCredentials(sortCredentialsByRecency(candidate?.sharedCredentials ?? [])),

    [candidate?.sharedCredentials],

  );

  const skillCards = useMemo(
    () => recruiterSkillCards(sharedCredentials),
    [sharedCredentials],
  );

  const identityLine = useMemo(

    () => buildDisclosedIdentityLine(sharedCredentials),

    [sharedCredentials],

  );



  if (loading) {

    return (

      <AppShell role="recruiter">

        <PageSkeleton rows={4} />

      </AppShell>

    );

  }



  if (error) {

    return (

      <AppShell role="recruiter">

        <div className="mx-auto max-w-3xl px-4 py-10">

          <p className="text-lg font-semibold">Could not load candidate</p>

          <p className="mt-2 text-sm text-muted-foreground">{error}</p>

          <Button className="mt-6" onClick={() => navigate("/recruiter/search")}>Back to search</Button>

        </div>

      </AppShell>

    );

  }



  if (!candidate) {

    return (

      <AppShell role="recruiter">

        <div className="mx-auto max-w-3xl px-4 py-10">

          <p className="text-lg font-semibold">Candidate not found</p>

          <Button className="mt-6" onClick={() => navigate("/recruiter/search")}>Back to search</Button>

        </div>

      </AppShell>

    );

  }



  return (

    <AppShell role="recruiter">

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">

        <Button

          variant="ghost"

          size="sm"

          className="-ml-2 mb-6 text-muted-foreground hover:text-foreground"

          onClick={() => navigate("/recruiter/search")}

        >

          <ArrowLeft className="mr-1.5 h-4 w-4" />

          Back to search

        </Button>



        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">

          {/* Main CV column */}

          <article className="min-w-0 flex-1 space-y-10">

            {/* Header block */}

            <header className="border-b border-border/70 pb-8">

              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">

                {candidate.name}

              </h1>

              {identityLine && (

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">

                  {identityLine}

                </p>

              )}

              <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">

                <Lock className="h-3 w-3 shrink-0" aria-hidden />

                Selective disclosure — wallet not accessible

              </p>

            </header>



            {/* Verified Skills */}

            <CvSection title="Verified Skills">

              {sharedCredentials.length === 0 ? (

                <EmptyState

                  icon={Wallet}

                  title="No shared credentials"

                  description="This candidate has not shared any active credentials with recruiters yet."

                  className="border-0 bg-transparent px-0 py-6"

                />

              ) : (

                <Accordion type="single" collapsible defaultValue={skillCards[0]?.id} className="w-full">

                  {skillCards.map((card) => (

                    <RecruiterSkillEvidenceItem key={card.id} card={card} />

                  ))}

                </Accordion>

              )}

            </CvSection>

          </article>



          {/* Sidebar — trust & summary (CV skills-summary column) */}

          <aside className="w-full shrink-0 space-y-8 lg:w-56 xl:w-64">

            <SidebarBlock title="Verification summary">

              <SidebarStat label="Attestation" value={candidate.attestation} highlight />

              <SidebarStat label="Shared credentials" value={String(candidate.credentialCount)} />

              <SidebarStat label="Disclosed evidence" value={String(candidate.evidence)} />

              <SidebarStat label="Active presentations" value={String(sharedCredentials.length)} />

            </SidebarBlock>



            {peerReviews.length > 0 && (

              <SidebarBlock title="Trust signals">

                <SidebarStat label="Peer reviews" value={String(trust.total)} />

                <SidebarStat label="Verified context" value={String(trust.verifiedContext)} />

                <SidebarStat label="High trust" value={String(trust.highTrust)} />

                <SidebarStat label="Pending" value={String(trust.pending)} />

              </SidebarBlock>

            )}



            <SidebarBlock title="Privacy">

              <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">

                <li>Only disclosed fields are shown.</li>

                <li>Revoked and expired shares are excluded.</li>

                <li>Full wallet access is never granted.</li>

              </ul>

              <StatusBadge variant="verified" className="mt-4" icon={<ShieldCheck className="h-3 w-3" />}>

                Shared presentations only

              </StatusBadge>

            </SidebarBlock>

          </aside>

        </div>

      </div>

    </AppShell>

  );

}



function CvSection({ title, children }: { title: string; children: ReactNode }) {

  return (

    <section>

      <h2 className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">

        {title}

      </h2>

      {children}

    </section>

  );

}



function SidebarBlock({ title, children }: { title: string; children: ReactNode }) {

  return (

    <div className="border-t border-border/60 pt-6 first:border-t-0 first:pt-0">

      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">

        {title}

      </h3>

      {children}

    </div>

  );

}



function SidebarStat({

  label,

  value,

  highlight = false,

}: {

  label: string;

  value: string;

  highlight?: boolean;

}) {

  return (

    <div className="mb-3 last:mb-0">

      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>

      <p className={`mt-0.5 ${highlight ? "text-sm font-semibold text-foreground" : "text-sm text-foreground/90"}`}>

        {value}

      </p>

    </div>

  );

}



function sortCredentialsByRecency(credentials: SharedCredentialView[]): SharedCredentialView[] {

  return [...credentials].sort(

    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),

  );

}



const TRACK_FIELD_IDS = new Set(["track", "role", "careerGoal", "career_goal"]);

const INSTITUTION_FIELD_IDS = new Set(["institution", "institutionName", "institution_name", "issuer"]);

const PROGRAM_FIELD_IDS = new Set(["program", "department"]);

const LOCATION_FIELD_IDS = new Set(["city", "country", "cityCountry", "city_country", "location"]);



function buildDisclosedIdentityLine(credentials: SharedCredentialView[]): string {

  const tracks = new Set<string>();

  const institutions = new Set<string>();

  const programs = new Set<string>();

  const locations = new Set<string>();



  const collect = (bucket: Set<string>, value: string | null | undefined) => {

    const trimmed = value?.trim();

    if (!trimmed || trimmed === "—") return;

    bucket.add(trimmed);

  };



  for (const credential of credentials) {

    for (const field of credential.disclosedFields) {

      if (!IDENTITY_FIELD_IDS.has(field.id)) continue;

      if (TRACK_FIELD_IDS.has(field.id)) collect(tracks, field.value);

      else if (INSTITUTION_FIELD_IDS.has(field.id)) collect(institutions, field.value);

      else if (PROGRAM_FIELD_IDS.has(field.id)) collect(programs, field.value);

      else if (LOCATION_FIELD_IDS.has(field.id)) collect(locations, field.value);

    }



    const payload = credential.disclosedPayload;

    const competency = asRecord(payload.competency);

    collect(tracks, asText(competency?.domain));



    const learner = asRecord(payload.learner);

    collect(institutions, asText(learner?.institution));

    collect(programs, asText(learner?.program));

    collect(locations, asText(learner?.cityCountry) ?? asText(learner?.location));

  }



  const parts: string[] = [];

  if (tracks.size) parts.push(`Track: ${joinIdentityValues(tracks)}`);

  if (institutions.size) parts.push(`Institution: ${joinIdentityValues(institutions)}`);

  if (programs.size) parts.push(`Program: ${joinIdentityValues(programs)}`);

  if (locations.size) parts.push(`Location: ${joinIdentityValues(locations)}`);



  return parts.join(" · ");

}



function joinIdentityValues(values: Set<string>): string {

  return [...values].join(", ");

}



function asRecord(value: unknown): Record<string, unknown> | null {

  return value && typeof value === "object" && !Array.isArray(value)

    ? (value as Record<string, unknown>)

    : null;

}



function asText(value: unknown): string | null {

  return typeof value === "string" && value.trim() ? value : null;

}



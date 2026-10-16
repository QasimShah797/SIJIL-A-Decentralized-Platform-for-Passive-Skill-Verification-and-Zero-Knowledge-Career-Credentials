import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/sijil/AppShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  RecruiterCompetencyDetail,
  displayRecruiterSkillName,
  recruiterSkillCards,
} from "@/components/recruiter/RecruiterSkillEvidence";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import { BookOpen, CalendarClock, GraduationCap, Lock, MapPin, ShieldCheck, Wallet } from "lucide-react";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import { fetchCandidateDetail } from "@/lib/db/shared-credentials";
import { computeTrustSignals } from "@/lib/sijil-data";
import { useEffect, useMemo, useState } from "react";
import type { PeerReview } from "@/lib/sijil-data";
import { getEvidenceStats } from "@/lib/recruiter-evidence";
import { dedupeLatestSharedCredentials, type CandidateDetailView, type SharedCredentialView } from "@/lib/shared-presentation";
import { cn } from "@/lib/utils";

const IDENTITY_FIELD_IDS = new Set([
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

type IdentityFields = {
  track: string;
  program: string;
  location: string;
};

export default function CandidateSummary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateDetailView | null>(null);
  const [peerReviews, setPeerReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

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
  const skillCards = useMemo(() => recruiterSkillCards(sharedCredentials), [sharedCredentials]);
  const identity = useMemo(() => buildDisclosedIdentity(sharedCredentials), [sharedCredentials]);
  const activeSkill = skillCards.find((card) => card.id === activeSkillId) ?? skillCards[0] ?? null;

  useEffect(() => {
    if (!skillCards.length) {
      setActiveSkillId(null);
      return;
    }
    setActiveSkillId((current) => (current && skillCards.some((card) => card.id === current) ? current : skillCards[0].id));
  }, [skillCards]);

  if (loading) {
    return (
      <AppShell role="recruiter">
        <PageSkeleton rows={4} />
      </AppShell>
    );
  }

  if (error || !candidate) {
    return (
      <AppShell role="recruiter">
        <div className="mx-auto max-w-3xl py-10">
          <p className="text-lg font-semibold">{error ? "Could not load candidate" : "Candidate not found"}</p>
          {error ? <p className="mt-2 text-sm text-muted-foreground">{error}</p> : null}
          <Button className="mt-6" onClick={() => navigate("/recruiter/search")}>Back to search</Button>
        </div>
      </AppShell>
    );
  }

  const evidence = getEvidenceStats(candidate);
  const identityItems = [
    { label: "Track", value: identity.track, icon: GraduationCap },
    { label: "Program", value: identity.program, icon: BookOpen },
    { label: "Location", value: identity.location, icon: MapPin },
  ].filter((item) => item.value);

  return (
    <AppShell role="recruiter">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#059669]">Candidate review</p>
            <h1 className="mt-2 text-2xl font-bold capitalize tracking-tight text-[#023E8A] sm:text-[1.75rem]">{candidate.name}</h1>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#64748b]">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Only disclosed fields are shown. The wallet stays private.
            </p>
          </div>
          <Button className="shrink-0 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Schedule Interview
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {identityItems.length > 0 ? (
              <dl className={cn("grid gap-4", identityItems.length > 1 ? "sm:grid-cols-2" : "", identityItems.length > 2 ? "xl:grid-cols-3" : "")}>
                {identityItems.map((item) => (
                  <div key={item.label} className="learner-stat-card p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8eef7] text-[#023E8A]">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <dt className="mt-4 text-xs font-medium text-[#64748b]">{item.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-[#023E8A]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <section className="learner-stat-card p-5">
              <h2 className="text-base font-semibold text-[#023E8A]">Verified competencies</h2>
              <p className="mt-1 text-xs text-[#64748b]">Select a competency to inspect the shared evidence.</p>

              {skillCards.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No shared credentials"
                  description="This candidate has not shared any active credentials with recruiters yet."
                  className="mt-4 border-0 bg-transparent px-0 py-6"
                />
              ) : (
                <>
                  <ul className="mt-4 space-y-2">
                    {skillCards.map((card) => {
                      const selected = card.id === activeSkill?.id;
                      return (
                        <li key={card.id}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setActiveSkillId(card.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                              selected
                                ? "border-[#023E8A] bg-[#e8eef7]"
                                : "border-[#e2e8f0] bg-white hover:border-[#023E8A]/30",
                            )}
                          >
                            <span className="learner-competency-icon flex h-11 w-11 shrink-0 items-center justify-center">
                              {displayRecruiterSkillName(card.name).slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[#023E8A]">
                                {displayRecruiterSkillName(card.name)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-[#64748b]">
                                {[
                                  card.domain,
                                  formatShortDate(card.createdAt) ? `Issued ${formatShortDate(card.createdAt)}` : null,
                                  formatShortDate(card.expiresAt) ? `Valid through ${formatShortDate(card.expiresAt)}` : null,
                                ].filter(Boolean).join(" · ") || "Shared competency"}
                              </span>
                            </span>
                            <span className="learner-tag-linked shrink-0">Verified</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {activeSkill ? (
                    <div className="mt-5">
                      <RecruiterCompetencyDetail card={activeSkill} />
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <div className="learner-stat-card p-5">
              <h3 className="text-sm font-semibold text-[#023E8A]">Verification summary</h3>
              <dl className="mt-4 space-y-3">
                <SummaryRow label="Verification" value={candidate.attestation} />
                <SummaryRow label="Shared credentials" value={String(evidence.credentials || candidate.credentialCount)} />
                <SummaryRow label="Disclosed evidence" value={String(evidence.evidenceTotal)} />
                <SummaryRow label="Active presentations" value={String(sharedCredentials.length)} />
              </dl>
            </div>

            {peerReviews.length > 0 ? (
              <div className="learner-stat-card p-5">
                <h3 className="text-sm font-semibold text-[#023E8A]">Trust signals</h3>
                <dl className="mt-4 space-y-3">
                  <SummaryRow label="Peer reviews" value={String(trust.total)} />
                  <SummaryRow label="Verified context" value={String(trust.verifiedContext)} />
                  <SummaryRow label="High trust" value={String(trust.highTrust)} />
                  <SummaryRow label="Pending" value={String(trust.pending)} />
                </dl>
              </div>
            ) : null}

            <div className="learner-stat-card p-5">
              <h3 className="text-sm font-semibold text-[#023E8A]">Privacy</h3>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#64748b]">
                <li>Only disclosed fields are shown.</li>
                <li>Revoked and expired shares are excluded.</li>
                <li>Full wallet access is never granted.</li>
              </ul>
              <StatusBadge variant="verified" className="mt-4" icon={<ShieldCheck className="h-3 w-3" />}>
                Shared presentations only
              </StatusBadge>
            </div>
          </aside>
        </div>

      <ScheduleInterviewDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        candidateId={candidate.id}
        candidateName={candidate.name}
      />
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f1f5f9] pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-[#64748b]">{label}</dt>
      <dd className="text-sm font-semibold text-[#023E8A]">{value}</dd>
    </div>
  );
}

function sortCredentialsByRecency(credentials: SharedCredentialView[]): SharedCredentialView[] {
  return [...credentials].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const TRACK_FIELD_IDS = new Set(["track", "role", "careerGoal", "career_goal"]);
const PROGRAM_FIELD_IDS = new Set(["program", "department"]);
const LOCATION_FIELD_IDS = new Set(["city", "country", "cityCountry", "city_country", "location"]);

function buildDisclosedIdentity(credentials: SharedCredentialView[]): IdentityFields {
  const tracks = new Set<string>();
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
      else if (PROGRAM_FIELD_IDS.has(field.id)) collect(programs, field.value);
      else if (LOCATION_FIELD_IDS.has(field.id)) collect(locations, field.value);
    }

    const payload = credential.disclosedPayload;
    const competency = asRecord(payload.competency);
    collect(tracks, asText(competency?.domain));

    const learner = asRecord(payload.learner);
    collect(programs, asText(learner?.program));
    collect(locations, asText(learner?.cityCountry) ?? asText(learner?.location));
  }

  return {
    track: joinIdentityValues(tracks),
    program: joinIdentityValues(programs),
    location: joinIdentityValues(locations),
  };
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

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

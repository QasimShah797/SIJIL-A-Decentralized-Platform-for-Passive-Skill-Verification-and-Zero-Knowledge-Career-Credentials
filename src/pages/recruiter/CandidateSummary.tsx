import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  RecruiterCompetencyDetail,
  displayRecruiterSkillName,
  recruiterSkillCards,
  sharedEvidenceForSkill,
} from "@/components/recruiter/RecruiterSkillEvidence";
import { CandidateCredentials } from "@/components/recruiter/CandidateCredentials";
import { CompetencyJourney } from "@/components/recruiter/CompetencyJourney";
import { listSharedCompetencyVersions } from "@/services/api/recruiter-workspace.api";
import type { SharedCompetencyVersion } from "@/services/api/recruiter-workspace.api";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CodeXml,
  GraduationCap,
  MapPin,
  UserRound,
  Layers,
  Route,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { fetchCandidateDetail } from "@/lib/db/shared-credentials";
import { useEffect, useMemo, useState } from "react";
import { extractDisclosedCredentialIdentity } from "@/lib/recruiter-ssi-verify";
import "./candidate-profile.css";
import {
  dedupeLatestSharedCredentials,
  type CandidateDetailView,
  type SharedCredentialView,
} from "@/lib/shared-presentation";
import { cn } from "@/lib/utils";
import type { RecruiterSkillCard } from "@/components/recruiter/RecruiterSkillEvidence";
import { SidebarProofRequestsCard } from "@/components/recruiter/SidebarProofRequestsCard";

type ProfileTab = "competencies" | "journey" | "verify";

const PROFILE_TABS: Array<{ id: ProfileTab; label: string; icon: typeof Layers }> = [
  { id: "competencies", label: "Shared Skills", icon: Layers },
  { id: "journey", label: "Skill History", icon: Route },
  { id: "verify", label: "Credentials", icon: ShieldCheck },
];

const PROFILE_TAB_IDS = new Set<ProfileTab>(PROFILE_TABS.map((tab) => tab.id));

function emptyStateCopy(tab: ProfileTab): { title: string; description: string } {
  switch (tab) {
    case "journey":
      return {
        title: "No longitudinal journey",
        description: "This learner has not shared credentials or progress with recruiters yet.",
      };
    case "verify":
      return {
        title: "Nothing to verify",
        description: "Shared competencies with an issued credential will appear here for SSI verification.",
      };
    default:
      return {
        title: "No shared credentials",
        description: "This learner has not shared credentials or progress with recruiters yet.",
      };
  }
}

type DisclosedPersonal = {
  program: string | null;
  location: string | null;
  careerGoal: string | null;
  photoUrl: string | null;
};

export default function CandidateSummary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedSkill = searchParams.get("skill");
  const [profileTab, setProfileTab] = useState<ProfileTab>(
    requestedTab && PROFILE_TAB_IDS.has(requestedTab as ProfileTab)
      ? requestedTab as ProfileTab
      : "competencies",
  );
  const [recordedVersions, setRecordedVersions] = useState<SharedCompetencyVersion[]>([]);

  useEffect(() => {
    if (requestedTab && PROFILE_TAB_IDS.has(requestedTab as ProfileTab)) {
      setProfileTab(requestedTab as ProfileTab);
      return;
    }
    // Drop legacy overview / proof-request tab links onto Shared Competencies.
    setProfileTab("competencies");
  }, [requestedTab]);

  useEffect(() => {
    if (!id) {
      setCandidate(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchCandidateDetail(id)
      .then((nextCandidate) => {
        if (!active) return;
        setCandidate(nextCandidate);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setCandidate(null);
        setError(nextError instanceof Error ? nextError.message : "Could not load learner.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const sharedCredentials = useMemo(
    () => dedupeLatestSharedCredentials(sortCredentialsByRecency(candidate?.sharedCredentials ?? [])),
    [candidate?.sharedCredentials],
  );
  const skillCards = useMemo(() => recruiterSkillCards(sharedCredentials), [sharedCredentials]);
  const personal = useMemo(() => buildDisclosedPersonal(sharedCredentials), [sharedCredentials]);
  const activeSkill = skillCards.find((card) => card.id === activeSkillId) ?? skillCards[0] ?? null;

  useEffect(() => {
    if (!id || !activeSkill) {
      setRecordedVersions([]);
      return;
    }
    let active = true;
    listSharedCompetencyVersions(id)
      .then((result) => {
        if (!active) return;
        const wanted = activeSkill.name.trim().toLowerCase();
        const versions = (result?.versions ?? []).filter(
          (version) => version.skillName.trim().toLowerCase() === wanted,
        );
        setRecordedVersions(versions);
      })
      .catch(() => { if (active) setRecordedVersions([]); });
    return () => { active = false; };
  }, [id, activeSkill]);

  useEffect(() => {
    if (!skillCards.length) {
      setActiveSkillId(null);
      return;
    }
    setActiveSkillId((current) => {
      if (requestedSkill) {
        const match = skillCards.find(
          (card) => card.name.trim().toLowerCase() === requestedSkill.trim().toLowerCase(),
        );
        if (match) return match.id;
      }
      if (current && skillCards.some((card) => card.id === current)) return current;
      return skillCards[0].id;
    });
  }, [skillCards, requestedSkill]);

  const selectProfileTab = (next: ProfileTab) => {
    setProfileTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    if (next === "journey" && activeSkill?.name) params.set("skill", activeSkill.name);
    else if (next !== "journey") params.delete("skill");
    setSearchParams(params, { replace: true });
  };

  if (loading) {
    return (
      <RecruiterWorkspaceShell>
        <PageSkeleton rows={4} />
      </RecruiterWorkspaceShell>
    );
  }

  if (error || !candidate) {
    return (
      <RecruiterWorkspaceShell>
        <div className="mx-auto max-w-3xl py-10">
          <p className="text-lg font-semibold">{error ? "Could not load learner" : "Learner not found"}</p>
          {error ? <p className="mt-2 text-sm text-muted-foreground">{error}</p> : null}
          <Button className="mt-6" onClick={() => navigate("/recruiter/search")}>Back to directory</Button>
        </div>
      </RecruiterWorkspaceShell>
    );
  }

  const evidenceSources = new Set(skillCards.flatMap((card) => sharedEvidenceForSkill(card).categories.map(({ source }) => source))).size;
  const sharedCredentialCount = candidate.credentialCount ?? 0;
  const activeVersions = recordedVersions.filter((version) => version.skillName.trim().toLowerCase() === activeSkill?.name.trim().toLowerCase());
  const credentialId = activeSkill
    ? activeSkill.credentialId ?? activeVersions.find((version) => version.hasCredential && version.credentialId)?.credentialId ?? null
    : null;
  const identity = activeSkill ? extractDisclosedCredentialIdentity(activeSkill.payload, credentialId) : null;
  const signature = activeSkill?.payload.issuerSignatureStatus;
  const signatureVerified = signature === "valid";
  const signatureFailed = signature === "invalid";

  const selectCompetency = (card: RecruiterSkillCard) => {
    setActiveSkillId(card.id);
    if (profileTab === "journey") {
      const params = new URLSearchParams(searchParams);
      params.set("tab", "journey");
      params.set("skill", card.name);
      setSearchParams(params, { replace: true });
    }
  };

  return (
    <RecruiterWorkspaceShell>
      <div className="candidate-profile">
        <Link to="/recruiter/search" className="candidate-back">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to Candidates
        </Link>
        <header className="candidate-hero">
          <div className="flex min-w-0 items-center gap-4">
            {personal.photoUrl
              ? <img src={personal.photoUrl} alt="" className="candidate-avatar object-cover" />
              : <span className="candidate-avatar">{initials(candidate.name)}</span>}
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold sm:text-2xl">{candidate.name}</h1>
              {(personal.program || personal.location) && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-50">
                  {personal.program && <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4" aria-hidden="true" />{personal.program}</span>}
                  {personal.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{personal.location}</span>}
                </div>
              )}
            </div>
          </div>
          <Button className="shrink-0 rounded-xl bg-white text-sijil-blue hover:bg-blue-50" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="size-4" aria-hidden="true" /> Schedule Interview
          </Button>
        </header>
        <div className="candidate-tabs" role="tablist" aria-label="Learner profile sections">
          {PROFILE_TABS.map(({ id: tab, label, icon: Icon }) => (
            <button key={tab} type="button" role="tab" aria-selected={profileTab === tab} onClick={() => selectProfileTab(tab)}>
              <Icon className="size-5 shrink-0" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

      {profileTab === "verify" ? (
        <CandidateCredentials key={candidate.id} cards={skillCards.filter((card) => card.credentialId)} />
      ) : (
      <div className="candidate-profile-grid">
        <div className="min-w-0 space-y-6">
          <div className="candidate-panel">
            <div className="p-4 sm:p-5">
              {skillCards.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title={emptyStateCopy(profileTab).title}
                  description={emptyStateCopy(profileTab).description}
                  className="border-0 bg-transparent px-0 py-6"
                />
              ) : (
                <div className="space-y-4">
                  {skillCards.length > 1 && <CompetencySlider
                    cards={skillCards}
                    activeId={activeSkill?.id ?? null}
                    onSelect={selectCompetency}
                  />}

                  {profileTab === "journey" && activeSkill ? (
                    <CompetencyJourney
                      skill={activeSkill.name}
                      recordedVersions={activeVersions}
                      disclosedPayload={activeSkill.payload}
                      sharedAt={activeSkill.createdAt}
                      credentials={sharedCredentials
                        .filter((credential) => {
                          const skillName = (credential.skill || credential.title || "").trim().toLowerCase();
                          const wanted = activeSkill.name.trim().toLowerCase();
                          return credential.presentationId === activeSkill.presentationId
                            || skillName === wanted;
                        })
                        .map((credential) => ({
                          id: credential.presentationId,
                          skill: activeSkill.name,
                          issuedAt: credential.createdAt,
                          issuer: credential.subtitle,
                          status: credential.status,
                        }))}
                    />
                  ) : null}

                  {activeSkill && profileTab === "competencies" ? (
                    <div>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="candidate-evidence-icon"><CodeXml className="size-6" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{displayRecruiterSkillName(activeSkill.name)}</h3>
                            <span className="learner-tag-linked">Shared</span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#64748b]">
                            {[
                              formatShortDate(activeSkill.createdAt) ? `Shared on ${formatShortDate(activeSkill.createdAt)}` : null,
                              formatShortDate(activeSkill.expiresAt) ? `Valid through ${formatShortDate(activeSkill.expiresAt)}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <RecruiterCompetencyDetail
                        card={activeSkill}
                        section="evidence"
                        credentialId={credentialId}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <section className="candidate-panel p-4">
            <h2 className="candidate-panel-title"><UserRound className="size-5" aria-hidden="true" /> Candidate Summary</h2>
            <dl className="mt-3">
              <SummaryRow icon={Layers} label="Shared Skills" value={String(skillCards.length)} />
              <SummaryRow icon={Award} label="Shared Credentials" value={String(sharedCredentialCount)} />
              <SummaryRow icon={Layers} label="Shared Evidence Sources" value={String(evidenceSources)} />
            </dl>
          </section>
          <section className="candidate-panel p-4">
            <h2 className="candidate-panel-title"><ShieldCheck className="size-5" aria-hidden="true" /> Credential Status</h2>
            <div className={cn("candidate-status", signatureVerified && "candidate-status-verified", signatureFailed && "candidate-status-failed")}>
              {signatureVerified ? <Check className="size-6 shrink-0" aria-hidden="true" /> : <ShieldCheck className="size-6 shrink-0" aria-hidden="true" />}
              <div>
                <strong>{signatureVerified ? "Signature verified" : signatureFailed ? "Signature check failed" : "Verification status unavailable"}</strong>
                <p className="text-xs">{signatureVerified ? "SIJIL verified the issuer signature when this credential was shared." : "Open credential details to check its current status."}</p>
              </div>
            </div>
            {activeSkill && (
              <>
                <div className="candidate-credential">
                  <span className="candidate-evidence-icon"><CodeXml className="size-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <strong className="break-words text-sm">{displayRecruiterSkillName(activeSkill.name)} Credential</strong>
                    <p className="text-xs text-slate-600">
                      {[identity?.issuer ? "Issued by " + identity.issuer : null,
                        formatShortDate(activeSkill.expiresAt) ? "Share valid through " + formatShortDate(activeSkill.expiresAt) : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => selectProfileTab("verify")} className="candidate-detail-link">
                  View Credential Details <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </>
            )}
          </section>

          {ZKP_UI_ENABLED && <SidebarProofRequestsCard
            skills={skillCards}
            learnerUserId={candidate.id}
          />}
        </aside>
      </div>
      )}

      </div>

      <ScheduleInterviewDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        candidateId={candidate.id}
        candidateName={candidate.name}
      />
    </RecruiterWorkspaceShell>
  );
}

function CompetencySlider({
  cards,
  activeId,
  onSelect,
}: {
  cards: RecruiterSkillCard[];
  activeId: string | null;
  onSelect: (card: RecruiterSkillCard) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-2">
        {cards.map((card) => {
          const selected = card.id === activeId;
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(card)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "border-[#023E8A] bg-[#023E8A] text-white"
                  : "border-[#e2e8f0] bg-white text-[#334155] hover:border-[#c5d4eb]",
              )}
            >
              {displayRecruiterSkillName(card.name)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-50 py-2 last:border-0">
      <dt className="flex items-center gap-2 text-sm text-slate-700"><Icon className="size-4 text-sijil-blue" aria-hidden="true" />{label}</dt>
      <dd className="text-sm font-semibold text-[#023E8A]">{value}</dd>
    </div>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "L").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function sortCredentialsByRecency(credentials: SharedCredentialView[]): SharedCredentialView[] {
  return [...credentials].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const PROGRAM_FIELD_IDS = new Set([
  "program",
  "department",
  "learner_program",
  "learner.program",
]);
const LOCATION_FIELD_IDS = new Set([
  "city",
  "country",
  "cityCountry",
  "city_country",
  "location",
  "learner_location",
  "learner.location",
  "learner.cityCountry",
]);
const CAREER_FIELD_IDS = new Set([
  "careerGoal",
  "career_goal",
  "learner_career_goal",
  "learner.careerGoal",
  "learner.career_goal",
]);
const PHOTO_FIELD_IDS = new Set([
  "learner_photo",
  "learner.photo",
  "photo",
  "avatar",
  "avatarUrl",
]);

function buildDisclosedPersonal(credentials: SharedCredentialView[]): DisclosedPersonal {
  let program: string | null = null;
  let location: string | null = null;
  let careerGoal: string | null = null;
  let photoUrl: string | null = null;

  const take = (current: string | null, next: string | null | undefined) => {
    if (current) return current;
    const trimmed = next?.trim();
    if (!trimmed || trimmed === "—") return null;
    return trimmed;
  };

  for (const credential of credentials) {
    for (const field of credential.disclosedFields) {
      if (PROGRAM_FIELD_IDS.has(field.id)) program = take(program, field.value);
      else if (LOCATION_FIELD_IDS.has(field.id)) location = take(location, field.value);
      else if (CAREER_FIELD_IDS.has(field.id)) careerGoal = take(careerGoal, field.value);
      else if (PHOTO_FIELD_IDS.has(field.id)) photoUrl = take(photoUrl, field.value);
    }

    const payload = credential.disclosedPayload;
    const learner = asRecord(payload.learner);
    program = take(program, asText(learner?.program));
    location = take(location, asText(learner?.cityCountry) ?? asText(learner?.location));
    careerGoal = take(careerGoal, asText(learner?.careerGoal) ?? asText(learner?.career_goal));
    photoUrl = take(photoUrl, asText(learner?.photo) ?? asText(learner?.avatarUrl) ?? asText(learner?.photoUrl));
  }

  return { program, location, careerGoal, photoUrl };
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

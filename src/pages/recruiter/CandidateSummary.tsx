import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RecruiterWorkspaceShell } from "@/components/sijil/RecruiterWorkspaceShell";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { EmptyState } from "@/components/sijil/EmptyState";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  RecruiterCompetencyDetail,
  displayRecruiterSkillName,
  recruiterSkillCards,
} from "@/components/recruiter/RecruiterSkillEvidence";
import { CompetencyJourney } from "@/components/recruiter/CompetencyJourney";
import { listSharedCompetencyVersions } from "@/services/api/recruiter-workspace.api";
import type { SharedCompetencyVersion } from "@/services/api/recruiter-workspace.api";
import { ScheduleInterviewDialog } from "@/components/recruiter/ScheduleInterviewDialog";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  Layers,
  Route,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { fetchCandidateDetail } from "@/lib/db/shared-credentials";
import { useEffect, useMemo, useState } from "react";
import { getEvidenceStats } from "@/lib/recruiter-evidence";
import {
  dedupeLatestSharedCredentials,
  type CandidateDetailView,
  type SharedCredentialView,
} from "@/lib/shared-presentation";
import { cn } from "@/lib/utils";
import type { RecruiterSkillCard } from "@/components/recruiter/RecruiterSkillEvidence";
import { SidebarProofRequestsCard } from "@/components/recruiter/SidebarProofRequestsCard";

type ProfileTab = "competencies" | "journey" | "verify";

const PROFILE_TABS: Array<{ id: ProfileTab; label: string; hint: string; icon: typeof Layers }> = [
  { id: "competencies", label: "Shared Competencies", hint: "GitHub, LMS, and practical evidence", icon: Layers },
  { id: "journey", label: "Longitudinal Journey", hint: "Repos, commits, tasks, credentials", icon: Route },
  { id: "verify", label: "Verify Credentials", hint: "SSI signature, issuer, and status", icon: ShieldCheck },
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

function detailSectionForTab(tab: ProfileTab): "evidence" | "verify" | null {
  if (tab === "competencies") return "evidence";
  if (tab === "verify") return "verify";
  return null;
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

  const evidence = getEvidenceStats(candidate);
  const institute = candidate.institution && candidate.institution !== "—"
    ? candidate.institution
    : null;

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
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {personal.photoUrl ? (
            <img
              src={personal.photoUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-[#e8eef7] sm:h-24 sm:w-24"
            />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#e8eef7] text-lg font-semibold text-[#023E8A] sm:h-24 sm:w-24 sm:text-xl">
              {initials(candidate.name)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold capitalize tracking-tight text-[#023E8A] sm:text-lg">
              {candidate.name}
            </h1>
            {institute ? (
              <p className="mt-1 truncate text-sm text-[#64748b]">{institute}</p>
            ) : null}
            <div className="mt-2">
              <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                {candidate.attestation}
              </StatusBadge>
            </div>
          </div>
        </div>
        <Button className="shrink-0 rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => setScheduleOpen(true)}>
          <CalendarClock className="mr-1.5 h-4 w-4" />
          Schedule Interview
        </Button>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <div className="learner-stat-card overflow-hidden">
            <div className="border-b border-[#e2e8f0] px-3 py-3 sm:px-4">
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                role="tablist"
                aria-label="Learner profile sections"
              >
                {PROFILE_TABS.map((tab) => {
                  const active = profileTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition",
                        active
                          ? "border-[#023E8A] bg-[#023E8A] text-white shadow-sm"
                          : "border-[#e2e8f0] bg-[#f8fafc] text-[#334155] hover:border-[#c5d4eb] hover:bg-white",
                      )}
                      onClick={() => selectProfileTab(tab.id)}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-white/15 text-white" : "bg-white text-[#023E8A]",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{tab.label}</span>
                        <span className={cn("mt-0.5 block truncate text-[10px]", active ? "text-white/80" : "text-[#94a3b8]")}>
                          {tab.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {skillCards.length === 0 ? (
                <EmptyState
                  icon={profileTab === "verify" ? ShieldCheck : Wallet}
                  title={emptyStateCopy(profileTab).title}
                  description={emptyStateCopy(profileTab).description}
                  className="border-0 bg-transparent px-0 py-6"
                />
              ) : (
                <div className="space-y-4">
                  <CompetencySlider
                    cards={skillCards}
                    activeId={activeSkill?.id ?? null}
                    onSelect={selectCompetency}
                  />

                  {profileTab === "journey" && activeSkill ? (
                    <CompetencyJourney
                      skill={activeSkill.name}
                      recordedVersions={recordedVersions}
                      disclosedPayload={activeSkill.payload}
                      sharedAt={activeSkill.createdAt}
                      credentials={sharedCredentials
                        .filter((credential) => {
                          const skillName = (credential.skill || credential.title || "").trim().toLowerCase();
                          const wanted = activeSkill.name.trim().toLowerCase();
                          return credential.presentationId === activeSkill.presentationId
                            || skillName === wanted
                            || skillName.includes(wanted)
                            || wanted.includes(skillName);
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

                  {activeSkill && detailSectionForTab(profileTab) ? (
                    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-[#023E8A]">
                            {displayRecruiterSkillName(activeSkill.name)}
                          </h3>
                          <p className="mt-0.5 text-xs text-[#64748b]">
                            {[
                              activeSkill.domain,
                              formatShortDate(activeSkill.createdAt) ? `Shared ${formatShortDate(activeSkill.createdAt)}` : null,
                              formatShortDate(activeSkill.expiresAt) ? `Valid through ${formatShortDate(activeSkill.expiresAt)}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className="learner-tag-linked">Shared</span>
                      </div>
                      <RecruiterCompetencyDetail
                        card={activeSkill}
                        section={detailSectionForTab(profileTab)!}
                        credentialId={
                          recordedVersions.find((version) => version.hasCredential && version.credentialId)
                            ?.credentialId
                          ?? recordedVersions.find((version) => version.credentialId)?.credentialId
                          ?? activeSkill.credentialId
                          ?? null
                        }
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="learner-stat-card p-5">
            <h3 className="text-sm font-semibold text-[#023E8A]">Verification summary</h3>
            <dl className="mt-4 space-y-3">
              <SummaryRow label="Status" value={candidate.attestation} />
              <SummaryRow label="Shared credentials" value={String(evidence.credentials || candidate.credentialCount)} />
              <SummaryRow label="Disclosed evidence" value={String(evidence.evidenceTotal)} />
              <SummaryRow label="Active presentations" value={String(sharedCredentials.length)} />
            </dl>
          </div>

          <SidebarProofRequestsCard
            skills={skillCards}
            learnerUserId={candidate.id}
          />
        </aside>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f1f5f9] pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-[#64748b]">{label}</dt>
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

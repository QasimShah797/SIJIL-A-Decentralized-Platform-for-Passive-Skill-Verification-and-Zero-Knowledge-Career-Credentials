import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { SharedPrivateVerificationPanel } from "@/components/recruiter/SharedPrivateVerificationPanel";
import { Award, CalendarDays, ChartNoAxesColumnIncreasing, ChevronDown, GitCommitHorizontal, Target, ClipboardCheck, ExternalLink, Github, GraduationCap, UsersRound } from "lucide-react";
import { buildEvidenceLedger, inspectorViewFromLedger } from "@/lib/public-credential";
import type { SharedCredentialView } from "@/lib/shared-presentation";
import { SsiVerifyCredentialCard } from "@/components/recruiter/SsiVerifyCredentialCard";

export type RecruiterSkillCard = {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
  expiresAt: string | null;
  competencyId: string;
  selectedFields: string[];
  payload: Record<string, unknown>;
  presentationId: string;
  credentialId: string | null;
  token?: string | null;
  proofType?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function recruiterSkillCards(credentials: SharedCredentialView[]): RecruiterSkillCard[] {
  const seen = new Set<string>();
  const cards: RecruiterSkillCard[] = [];

  for (const credential of credentials) {
    const payload = credential.disclosedPayload ?? {};
    const competency = asRecord(payload.competency) ?? {};
    const skillRows = Array.isArray(payload.skills)
      ? payload.skills.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      : [];
    const rows = skillRows.length > 0
      ? skillRows
      : [{
          competencyId: competency.competencyId ?? credential.presentationId,
          name: credential.skill ?? credential.title,
          domain: competency.domain ?? credential.subtitle,
        }];

    for (const row of rows) {
      const name = asText(row.name) || credential.skill || credential.title;
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      cards.push({
        id: `${credential.presentationId}:${asText(row.competencyId) || name}`,
        name,
        domain: asText(row.domain) || credential.subtitle,
        createdAt: credential.createdAt,
        expiresAt: credential.expiresAt,
        competencyId: asText(row.competencyId) || asText(competency.competencyId) || name,
        selectedFields: credential.selectedFields,
        payload,
        presentationId: credential.presentationId,
        token: credential.token,
        proofType: credential.proofType,
        credentialId: asText(credential.credentialId) || null,
      });
    }
  }

  return cards;
}

export function displayRecruiterSkillName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RecruiterCompetencyDetail({
  card,
  section = "all",
  credentialId = null,
}: {
  card: RecruiterSkillCard;
  section?: "all" | "evidence" | "verify";
  /** Issued credential id from shared competency versions (selective disclosure). */
  credentialId?: string | null;
}) {
  const showEvidence = section === "all" || section === "evidence";
  const showVerify = section === "all" || section === "verify";
  const issuedCredentialId = credentialId || card.credentialId;

  return (
    <div className="space-y-4">
      {showEvidence && <SharedEvidenceRows card={card} />}

      {showVerify && ZKP_UI_ENABLED ? (
        <SharedPrivateVerificationPanel
          payload={card.payload}
          competencyName={displayRecruiterSkillName(card.name)}
          selectedFields={card.selectedFields}
          createdAt={card.createdAt}
          expiresAt={card.expiresAt}
          proofType={card.proofType ?? null}
          verifyHref={card.token ? `/recruiter/verify/${encodeURIComponent(card.token)}` : undefined}
        />
      ) : null}
      {showVerify ? (
        <SsiVerifyCredentialCard
          payload={card.payload}
          versionCredentialId={issuedCredentialId}
          sharedAt={card.createdAt}
        />
      ) : null}
    </div>
  );
}

const PROFILE_EVIDENCE = [
  { source: "github", field: "github_evidence", key: "github", label: "GitHub Projects", icon: Github },
  { source: "lms", field: "lms_evidence", key: "lms", label: "Moodle Learning", icon: GraduationCap },
  { source: "practical_task", field: "practical_task_result", key: "practicalTask", label: "Practical Task", icon: ClipboardCheck },
  { source: "peer_review", field: "peer_reviews", key: "peerReviews", label: "Peer Reviews", icon: UsersRound },
] as const;

export function sharedEvidenceForSkill(card: RecruiterSkillCard) {
  const parent = asRecord(card.payload.competency);
  const rows = Array.isArray(card.payload.skills) ? card.payload.skills : [];
  const skill = rows.map(asRecord).find((row) => row?.competencyId === card.competencyId);
  const rootEvidence = asRecord(card.payload.evidence) ?? {};
  const primary = parent?.competencyId === card.competencyId || (!parent?.competencyId && (!skill || skill.primary === true));
  const evidence = asRecord(skill?.evidence) ?? (primary ? asRecord(rootEvidence.completeEvidencePackage) ?? rootEvidence : {});
  const modes = asRecord(card.payload.evidenceModes);
  const categories = PROFILE_EVIDENCE.filter(({ key, field }) => {
    const value = evidence[key];
    if (modes?.[field] === "omit" || modes?.[field] === "private") return false;
    return (card.selectedFields.includes(field) || card.selectedFields.includes("complete_evidence_package"))
      && (Array.isArray(value) ? value.length > 0 : Object.keys(asRecord(value) ?? {}).length > 0);
  });
  const selected = categories.map(({ field }) => field);
  const scopedPayload = {
    competency: { competencyId: card.competencyId },
    evidence: Object.fromEntries(categories.map(({ key }) => [key, evidence[key]])),
  };
  const ledger = buildEvidenceLedger(scopedPayload, card.competencyId, selected);
  return { categories, evidence, ledger, inspector: inspectorViewFromLedger(ledger) };
}

function SharedEvidenceRows({ card }: { card: RecruiterSkillCard }) {
  const { categories, evidence, ledger, inspector } = sharedEvidenceForSkill(card);
  return (
    <section className="candidate-evidence" aria-label="Shared evidence">
      <h3>Shared Evidence ({categories.length})</h3>
      {categories.length === 0 && <p className="p-3 text-sm text-slate-600">No evidence was disclosed for this skill.</p>}
      {categories.map(({ source, key, label, icon: Icon }) => {
        const rows = ledger.filter((item) => item.source === source);
        const summary = asRecord(evidence[key]);
        const reviewCount = numberOrNull(summary?.reviewCount);
        const courseCount = numberOrNull(summary?.courseCount);
        const assignmentCount = numberOrNull(summary?.assignmentCount);
        const description = source === "practical_task" ? "Completed assessment"
          : source === "peer_review" && reviewCount != null ? `${reviewCount} shared ${reviewCount === 1 ? "review" : "reviews"}`
          : source === "lms" && courseCount != null && assignmentCount != null
            ? `${courseCount} ${courseCount === 1 ? "course" : "courses"}, ${assignmentCount} ${assignmentCount === 1 ? "assignment" : "assignments"}`
            : asText(summary?.summary) || rows[0]?.detail || asText(summary?.status) || "Shared evidence";
        const repositoryCount = typeof summary?.repositoryCount === "number" ? summary.repositoryCount : inspector.github.repos;

        return (
          <details className="candidate-evidence-row" key={card.id + ":" + source} open={source === "github" || source === "practical_task" || undefined}>
            <summary>
              <Icon className="size-6 shrink-0 text-sijil-blue" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-slate-900">{label}</strong>
                <span className="block break-words text-xs text-slate-600">
                  {source === "github" && repositoryCount > 0
                    ? repositoryCount + (repositoryCount === 1 ? " repository" : " repositories") + (inspector.github.languages.length ? " · " + inspector.github.languages.join(", ") : "")
                    : source === "peer_review" && rows.length > 0 ? rows.length + (rows.length === 1 ? " shared review" : " shared reviews")
                    : description}
                </span>
              </span>
              {source === "lms" && inspector.lmsRows.length === 1 && inspector.lmsRows[0].scorePercent != null && (
                <span className="hidden border-l border-blue-100 pl-3 text-xs sm:block">
                  Score <strong className="block text-sm text-sijil-blue">{inspector.lmsRows[0].scoreLabel}</strong>
                </span>
              )}
              {(source === "github" || source === "peer_review") && rows.length > 0 && (
                <span className="hidden shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-sijil-blue md:inline">
                  {source === "github" ? "View Repositories" : "View Reviews"}
                </span>
              )}
              <ChevronDown className="candidate-evidence-chevron size-4 shrink-0 text-sijil-blue" aria-hidden="true" />
            </summary>
            {source === "github" && inspector.githubRepos.length ? (
              <SharedGithubTable repos={inspector.githubRepos} summary={summary} />
            ) : source === "practical_task" ? (
              <SharedPracticalStats summary={summary ?? {}} fallback={inspector.practicalSummary} />
            ) : rows.length ? (
              <ul className="space-y-2 border-t border-blue-100 px-4 py-3 text-sm">
                {rows.map((item) => (
                  <li key={item.id} className="break-words">
                    {item.url && (item.url.startsWith("https://") || item.url.startsWith("http://")) ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sijil-blue hover:underline">
                        {item.title} <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : <strong>{item.title}</strong>}
                    {item.detail && <p className="text-xs text-slate-600">{item.detail}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="border-t border-blue-100 px-4 py-3 text-sm text-slate-600">{description}</p>}
          </details>
        );
      })}
    </section>
  );
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatCommitDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function SharedGithubTable({ repos, summary }: {
  repos: ReturnType<typeof inspectorViewFromLedger>["githubRepos"];
  summary: Record<string, unknown> | null;
}) {
  const sharedRepos = Array.isArray(summary?.repos) ? summary.repos : [];
  return (
    <div className="candidate-commit-table">
      <table aria-label="Shared GitHub repositories">
        <thead>
          <tr>
            <th scope="col">Repository</th>
            <th scope="col">Language</th>
            <th scope="col" title="Commits authored by the learner in this repository">Learner commits</th>
            <th scope="col">Latest learner commit</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((repo, index) => {
            const matched = sharedRepos.map(asRecord).find((row) => (asText(row?.full_name) || asText(row?.repo_name)) === repo.name);
            const metrics = asRecord(matched?.recruiterMetrics);
            const count = numberOrNull(metrics?.syncedCommitCount);
            const date = formatCommitDate(metrics?.lastCommitAt);
            return (
              <tr key={repo.name + ":" + index}>
                <td>{repo.url && (repo.url.startsWith("https://") || repo.url.startsWith("http://")) ? (
                  <a href={repo.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sijil-blue hover:underline">
                    {repo.name} <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                ) : repo.name}</td>
                <td>{repo.language ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-sijil-blue">{repo.language}</span> : "Unavailable"}</td>
                <td>{count != null ? <span className="inline-flex items-center gap-1 font-semibold"><GitCommitHorizontal className="size-3.5" aria-hidden="true" />{count}</span> : missingMetric(metrics, "syncedCommitCount")}</td>
                <td>{date ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="size-3.5" aria-hidden="true" />{date}</span> : count === 0 ? "No commits" : missingMetric(metrics, "lastCommitAt")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function missingMetric(metrics: Record<string, unknown> | null, key: string) {
  if (!metrics) return "Not included in this share";
  return key in metrics ? "Unavailable" : "Not shared";
}

function SharedPracticalStats({ summary, fallback }: {
  summary: Record<string, unknown>;
  fallback: ReturnType<typeof inspectorViewFromLedger>["practicalSummary"];
}) {
  const latest = asRecord(summary.latestAttempt);
  const exactMetrics = asRecord(summary.recruiterMetrics);
  const metrics = exactMetrics ?? latest ?? summary;
  const correct = numberOrNull(metrics.correctCount);
  const total = numberOrNull(metrics.totalQuestions);
  const score = numberOrNull(metrics.assessmentScorePercent ?? metrics.scorePercent) ?? fallback?.exactScorePercent ?? null;
  const attempts = numberOrNull(summary.attemptCount) ?? fallback?.sittings ?? null;
  const cards = [
    { label: "Total Attempts", value: attempts, empty: "Unavailable", icon: Target },
    { label: "Latest Attempt Marks", value: correct != null && total != null && total > 0 ? correct + " / " + total : null, empty: summary.scoreHidden ? "Not shared" : missingMetric(exactMetrics, "correctCount"), icon: Award },
    { label: "Latest Score", value: score != null ? score + "%" : null, empty: summary.scoreHidden ? "Not shared" : missingMetric(exactMetrics, "assessmentScorePercent"), icon: ChartNoAxesColumnIncreasing },
  ];
  return (
    <dl className="candidate-task-stats">
      {cards.map(({ label, value, empty, icon: Icon }) => (
        <div key={label}>
          <Icon className="size-5 shrink-0 text-sijil-blue" aria-hidden="true" />
          <div>
            <dt>{label}</dt>
            <dd className={value == null ? "candidate-stat-withheld" : undefined}>{value ?? empty}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

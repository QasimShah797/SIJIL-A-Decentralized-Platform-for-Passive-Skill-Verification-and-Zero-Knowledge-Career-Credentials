import { formatTimestamp } from "@/components/zkp/policy-outcome";
import { competencyJourney, type DisclosedCompetencyVersion } from "@/lib/recruiter-journey";
import type { SharedCompetencyVersion } from "@/services/api/recruiter-workspace.api";

function anchorLabel(status: SharedCompetencyVersion["anchorStatus"]): string {
  switch (status) {
    case "confirmed":
      return "Blockchain anchor confirmed";
    case "failed":
      return "Blockchain anchor failed";
    case "unavailable":
      return "Blockchain anchor unavailable";
    default:
      return "Blockchain anchor not requested";
  }
}

export function CompetencyJourney({
  skill,
  credentials,
  recordedVersions = [],
}: {
  skill: string;
  credentials: Array<{ id: string; skill: string; issuedAt: string; issuer?: string | null; status?: string | null }>;
  recordedVersions?: SharedCompetencyVersion[];
}) {
  const disclosed = competencyJourney(credentials, skill);

  return (
    <section className="learner-stat-card p-5" aria-labelledby="competency-journey-heading">
      <h2 id="competency-journey-heading" className="text-base font-semibold text-[#023E8A]">Skill growth journey</h2>
      <p className="mt-1 text-xs text-[#64748b]">
        A new version is recorded only after validation and a separate issued credential. Extra GitHub activity is not treated as a higher skill level.
      </p>
      {recordedVersions.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {recordedVersions.map((version) => (
            <li key={version.id} className="rounded-lg border border-[#e2e8f0] bg-white p-3 text-sm text-[#334155]">
              <p className="font-medium text-[#023E8A]">Version {version.versionNumber} · {version.status === "issued" ? "Signed credential" : "Evidence recorded, not a credential"}</p>
              <p className="mt-1">Recorded {formatTimestamp(version.createdAt)}. Signature status and the blockchain anchor are separate. {anchorLabel(version.anchorStatus)}.</p>
              {version.credentialId ? <p className="mt-1">Credential {version.credentialId}</p> : null}
            </li>
          ))}
        </ol>
      ) : disclosed.length === 0 ? (
        <p className="mt-4 text-sm text-[#334155]">No disclosed credential is available for this competency.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-[#334155]">
            {disclosed.length < 2
              ? "This competency has one verified credential. Future validated updates will appear here when shared."
              : `${disclosed.length} disclosed credentials are available for this skill.`}
          </p>
          <ol className="mt-4 space-y-3 border-l border-[#c7d7f5] pl-4">
            {disclosed.map((version, index) => (
              <li key={version.id}>
                <JourneyMilestone version={version} index={index} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function JourneyMilestone({ version, index }: { version: DisclosedCompetencyVersion; index: number }) {
  return (
    <article className="rounded-lg border border-[#e2e8f0] bg-white p-3 text-sm text-[#334155]">
      <p className="font-medium text-[#023E8A]">Disclosed credential {index + 1}</p>
      <p className="mt-1">Issued {formatTimestamp(version.issuedAt)}{version.issuer ? ` by ${version.issuer}` : ""}.</p>
      <p className="mt-1 text-xs text-[#64748b]">Status: {version.status}. This is the shared credential, not an estimated skill increase.</p>
    </article>
  );
}

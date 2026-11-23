import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/services/api/client";

type VersionRow = {
  id: string;
  skillName: string;
  versionNumber: number;
  status: string;
  anchorStatus: string;
  credentialId: string | null;
};

export function CompetencyVersionCard() {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [skillName, setSkillName] = useState("");
  const [source, setSource] = useState<"github" | "moodle" | "practical">("github");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [verification, setVerification] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const result = await apiRequest<{ available: boolean; versions: VersionRow[] }>("/wallet/competency-versions").catch(() => null);
    setAvailable(result?.available !== false);
    setVersions(result?.versions ?? []);
  };

  useEffect(() => { void load(); }, []);

  const record = async () => {
    setError(null);
    setMessage(null);
    try {
      await apiRequest("/wallet/competency-versions", {
        method: "POST",
        body: JSON.stringify({ skillName, evidenceSource: source, evidenceReference: reference, evidenceSummary: note }),
      });
      setMessage("Evidence recorded. No credential was issued.");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^API \d+:\s*/, "") : "The evidence could not be recorded.");
    }
  };

  const checkSignature = async (version: VersionRow) => {
    if (!version.credentialId) return;
    const result = await apiRequest<{ status?: string; checks?: { signature?: string } }>(`/public/credentials/${version.credentialId}/verify`).catch(() => null);
    const signature = result?.checks?.signature ?? result?.status ?? "unavailable";
    setVerification((current) => ({ ...current, [version.id]: signature }));
  };

  if (!available) return null;

  return (
    <section className="learner-stat-card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-sijil-blue">Competency versions</h2>
      <p className="text-xs text-[#64748b]">You can record new GitHub, Moodle, or practical evidence. An authorized issuer must sign a new credential before a version is issued. An older credential cannot be reused.</p>
      <label className="block text-xs" htmlFor="version-skill">Competency</label>
      <input id="version-skill" value={skillName} onChange={(event) => setSkillName(event.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
      <label className="block text-xs" htmlFor="version-source">Evidence source</label>
      <select id="version-source" value={source} onChange={(event) => setSource(event.target.value as "github" | "moodle" | "practical")} className="w-full rounded-md border px-2 py-1 text-sm">
        <option value="github">GitHub</option>
        <option value="moodle">Moodle</option>
        <option value="practical">Practical assessment</option>
      </select>
      <label className="block text-xs" htmlFor="version-reference">Trusted evidence reference</label>
      <input id="version-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="attempt:… or repo:owner/name" className="w-full rounded-md border px-2 py-1 text-sm" />
      <label className="block text-xs" htmlFor="version-note">What is new</label>
      <textarea id="version-note" value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" rows={3} />
      <Button type="button" size="sm" onClick={() => void record()}>Record evidence</Button>
      {versions.map((version) => (
        <article key={version.id} className="rounded-lg border border-[hsl(var(--sijil-blue)/0.17)] p-3 text-xs text-[#334155]">
          <p className="font-medium">{version.skillName} · version {version.versionNumber}</p>
          <p className="mt-1">Status: {version.status === "issued" ? "Issued" : "Pending evidence"}. Anchor: {version.anchorStatus}.</p>
          {version.status !== "issued" ? <p className="mt-1">Waiting for an authorized issuer. This record is not a verified credential.</p> : (
            <button type="button" className="mt-2 underline" onClick={() => void checkSignature(version)}>Check signature</button>
          )}
          {version.credentialId && verification[version.id] ? <p className="mt-1">Signature check: {verification[version.id]}. Anchor: {version.anchorStatus}.</p> : null}
        </article>
      ))}
      {message ? <p className="text-xs text-[#334155]">{message}</p> : null}
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </section>
  );
}

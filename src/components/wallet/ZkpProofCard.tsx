/**
 * Learner-controlled score proof for one credential.
 * The Groth16 proof is generated in the browser. The score is shown only here.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getZkpStatus, getZkpWitness, listLearnerScoreRequests, listVerificationRequests, approveVerificationRequest, rejectVerificationRequest, declineScoreRequest, submitScoreProof, type ScoreRequestSummary, type VerificationRequestView } from "@/services/api/zkp.api";
import { generateScoreThresholdProof, loadPinnedArtifacts, type ArtifactHashes, type ScoreWitness } from "@/lib/zkp/generate-score-proof";
import { formatTimestamp, outcomeLabel, requestStatusLabel } from "@/components/zkp/policy-outcome";

const PRESETS = [60, 70, 80] as const;
type Phase = "idle" | "preparing" | "generating" | "verifying" | "ready";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "";
}

function scoreLookupError(err: unknown): string {
  const message = errorText(err);
  if (/Cannot reach the SIJIL API|Failed to fetch|NetworkError|ECONNREFUSED|API 500|API 502/i.test(message)) {
    return "The score service could not be reached. Start the backend, then try again.";
  }
  if (/API 401/i.test(message)) return "Sign in again to view your private score.";
  if (/API 403/i.test(message)) return "You can only view the private score for your own credential.";
  if (/does not belong|no trusted assessment|unsupported assessment|does not match the trusted opening|not a valid signed credential|Revoked credentials|Credential not found|API 404|API 409/i.test(message)) {
    return "Private score unavailable for this credential.";
  }
  return "Private score unavailable for this credential. You can try again.";
}

function friendlyError(err: unknown): string {
  const message = errorText(err);
  if (/API 503/i.test(message) || /not available until/i.test(message)) {
    return "Verification requests are not ready on this server yet. The setup table still needs to be applied.";
  }
  if (/does not meet/i.test(message)) return "Your private score does not meet this minimum, so a proof cannot be created.";
  if (/local proof/i.test(message)) return "The proof could not be checked on this device. You can try again.";
  if (/API 409|API 404|API 400/i.test(message)) return message.replace(/^API \d+:\s*/, "");
  if (/Cannot reach the SIJIL API|Failed to fetch|NetworkError|ECONNREFUSED/i.test(message)) {
    return "The server could not be reached. You can try again.";
  }
  return "The proof could not be completed. You can try again.";
}

export function ZkpProofCard({
  credentialId,
  commitment,
  competencyId,
  focusVerificationId,
}: {
  credentialId: string;
  commitment: string;
  competencyId?: string;
  focusVerificationId?: string | null;
}) {
  const [requests, setRequests] = useState<ScoreRequestSummary[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequestView[]>([]);
  const [requestsReady, setRequestsReady] = useState(false);
  const [policyLine, setPolicyLine] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(60);
  const [witness, setWitness] = useState<ScoreWitness | null>(null);
  const [artifactHashes, setArtifactHashes] = useState<ArtifactHashes | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const openRequest = requests.find((row) => row.credentialId === credentialId && row.status === "open") ?? null;
  const history = requests.filter((row) => row.credentialId === credentialId && row.status !== "open");
  const mirror = openRequest
    ? verificationRequests.find((row) => row.legacyScoreRequestId === openRequest.id && row.category === "practical-score") ?? null
    : null;
  const waitingForApproval = mirror?.status === "pending";
  const highlighted = Boolean(focusVerificationId && mirror?.id === focusVerificationId);

  const load = useCallback(async () => {
    try {
      const [status, mine, verification] = await Promise.all([
        getZkpStatus(competencyId).catch(() => null),
        listLearnerScoreRequests().catch(() => null),
        listVerificationRequests("learner").catch(() => null),
      ]);
      if (status) {
        const item = status.assessment.find((row) => row.commitment === commitment);
        setPolicyLine(item ? `Automatic 60% check: ${outcomeLabel(item.outcome)}` : "Automatic 60% check: not ready");
      }
      setRequests(mine?.requests ?? []);
      setVerificationRequests(verification?.requests ?? []);
      setRequestsReady(true);
    } catch (err) {
      setError(friendlyError(err));
      setRequestsReady(true);
    }
  }, [commitment, competencyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!highlighted) return;
    const node = document.getElementById("zkp-open-request");
    if (typeof node?.scrollIntoView === "function") node.scrollIntoView({ block: "center" });
  }, [highlighted]);

  useEffect(() => {
    if (openRequest) setThreshold(openRequest.threshold);
  }, [openRequest]);

  const score = witness ? Number(witness.score) : null;
  const eligible = score !== null && Number.isInteger(score) && score >= threshold;

  const prepare = async () => {
    setError(null);
    setDecision(null);
    setApproved(false);
    setPhase("preparing");
    try {
      const owner = await getZkpWitness(credentialId);
      if (owner.commitment !== commitment) {
        throw new Error("This proof does not belong to the credential you opened.");
      }
      setWitness(owner.witness);
      setArtifactHashes(owner.artifactHashes);
      setPhase("idle");
    } catch (err) {
      setPhase("idle");
      setError(scoreLookupError(err));
    }
  };

  const send = async () => {
    if (!witness || !artifactHashes || !openRequest || !approved) return;
    setError(null);
    setPhase("generating");
    try {
      const artifacts = await loadPinnedArtifacts();
      const checked = await generateScoreThresholdProof({
        credentialId,
        commitment,
        threshold,
        witness,
        ...artifacts,
        artifactHashes,
      });
      setPhase("verifying");
      const result = await submitScoreProof(openRequest.id, {
        circuitId: "score-threshold-v1",
        proof: checked.proof,
        publicSignals: checked.publicSignals,
      });
      setDecision(result.message);
      setPhase(result.accepted ? "ready" : "idle");
      setWitness(null);
      setArtifactHashes(null);
      setApproved(false);
      await load();
    } catch (err) {
      setPhase("idle");
      setError(friendlyError(err));
    }
  };

  const hideScore = () => {
    setWitness(null);
    setArtifactHashes(null);
    setApproved(false);
  };

  const decline = async () => {
    if (!openRequest) return;
    setError(null);
    try {
      if (mirror && (mirror.status === "pending" || mirror.status === "approved" || mirror.status === "generating")) {
        await rejectVerificationRequest(mirror.id);
      } else {
        await declineScoreRequest(openRequest.id);
      }
      setWitness(null);
      setArtifactHashes(null);
      setApproved(false);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const approveRequest = async () => {
    if (!mirror || mirror.status !== "pending") return;
    setError(null);
    try {
      await approveVerificationRequest(mirror.id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const phaseLabel = phase === "preparing"
    ? "Preparing"
    : phase === "generating"
      ? "Generating"
      : phase === "verifying"
        ? "Verifying"
        : phase === "ready"
          ? "Ready"
          : null;

  return (
    <section className="learner-stat-card space-y-3 p-4" aria-labelledby="zkp-proof-heading" aria-busy={phase === "generating" || phase === "verifying"}>
      <div>
        <h2 id="zkp-proof-heading" className="text-sm font-semibold text-[#023E8A]">Private score proof</h2>
        <p className="mt-1 text-xs text-[#64748b]">
          A zero-knowledge proof lets a recruiter check a minimum score without seeing the score itself.
          It does not, by itself, prove who graded the assessment or that a blockchain record exists.
        </p>
      </div>
      <dl className="grid gap-2 text-xs text-[#334155] sm:grid-cols-2">
        <div>
          <dt className="font-medium">Private score</dt>
          <dd>Only you can see the exact percentage, and only after you ask to prepare a proof.</dd>
        </div>
        <div>
          <dt className="font-medium">Minimum requirement</dt>
          <dd>The recruiter chooses a percentage. The proof says whether you meet it.</dd>
        </div>
        <div>
          <dt className="font-medium">Confirmed proof</dt>
          <dd>Shown only after the proof checks on this device and the server accepts the request.</dd>
        </div>
        <div>
          <dt className="font-medium">What the recruiter can see</dt>
          <dd>Pass or fail for that minimum, plus whether the credential signature still checks out.</dd>
        </div>
      </dl>
      {policyLine ? <p className="text-xs text-[#64748b]">{policyLine}. This is separate from a recruiter's own minimum.</p> : null}

      {openRequest ? (
        <div id="zkp-open-request" className={`rounded-lg border bg-[#f8fbff] p-3 text-xs text-[#334155] ${highlighted ? "border-[#4f46e5] ring-2 ring-[#4f46e5]" : "border-[#c7d7f5]"}`} role="status">
          <p>
            {mirror ? `${mirror.recruiterLabel} requested verification of ${mirror.skillLabel}. ` : "A recruiter asked you to prove a minimum. "}
            The public threshold is a minimum of {openRequest.threshold}%. The request expires {formatTimestamp(openRequest.expiresAt)}.
            Stopping the share link later does not delete a result they already saved.
          </p>
          {waitingForApproval ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void approveRequest()}>Approve request</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void decline()}>Reject request</Button>
            </div>
          ) : !(witness && eligible) ? (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void decline()}>
              Decline request
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[#64748b]">
          {requestsReady ? "No open recruiter request for this credential. You can still check a minimum privately." : "Loading requests…"}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Minimum score">
        {PRESETS.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={threshold === value ? "default" : "outline"}
            disabled={Boolean(openRequest) || phase === "generating" || phase === "verifying"}
            onClick={() => { setThreshold(value); setApproved(false); setDecision(null); }}
          >
            {value}%
          </Button>
        ))}
      </div>

      {witness && score !== null ? (
        <div className="space-y-2">
          <p className="text-sm text-[#0f172a]">Your private score is {score}%. {eligible ? "You can prove this minimum." : "You cannot prove this minimum. You can decline the request."}</p>
          <Button type="button" variant="outline" size="sm" onClick={hideScore}>Hide my private score</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => void prepare()} disabled={phase === "preparing" || phase === "generating" || phase === "verifying"}>
          {phase === "preparing" ? "Preparing…" : "Show my private score"}
        </Button>
      )}

      {witness && eligible && openRequest && !waitingForApproval ? (
        <div className="space-y-2 rounded-lg border p-3 text-xs text-[#334155]">
          <p className="font-medium">Review what will be shared</p>
          <p>Shared: that your score meets {threshold}%, tied to this credential and this one request.</p>
          <p>Hidden: the exact score and the secret used to hide it.</p>
          <label className="flex items-start gap-2" htmlFor="zkp-approve">
            <input
              id="zkp-approve"
              type="checkbox"
              className="mt-0.5"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            I approve sending this proof for the {threshold}% request.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!approved || phase === "generating" || phase === "verifying"} onClick={() => void send()}>
              {phase === "generating" || phase === "verifying" ? phaseLabel : "Generate and send proof"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void decline()}>Reject request</Button>
          </div>
        </div>
      ) : null}

      {phaseLabel ? <p className="text-xs font-medium text-[#023E8A]" role="status" aria-live="polite">{phaseLabel}</p> : null}
      {decision ? <p className="text-xs text-[#334155]" role="status">{decision}</p> : null}
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
      {history.length > 0 ? (
        <ul className="space-y-1 text-xs text-[#64748b]">
          {history.slice(0, 4).map((row) => (
            <li key={row.id}>Request for {row.threshold}%: {requestStatusLabel(row.status)} · {formatTimestamp(row.createdAt)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

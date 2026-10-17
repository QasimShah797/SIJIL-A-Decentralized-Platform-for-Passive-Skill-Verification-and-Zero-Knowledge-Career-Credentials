/**
 * Learner wallet action for a local Groth16 score proof.
 * Selective HMAC sharing stays on the separate share card.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getZkpWitness } from "@/services/api/zkp.api";
import { generateScoreThresholdProof, loadPinnedArtifacts, type ScoreProofResult } from "@/lib/zkp/generate-score-proof";

export function ZkpProofCard({
  credentialId,
  commitment,
}: {
  credentialId: string;
  commitment: string;
}) {
  const [threshold, setThreshold] = useState(60);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreProofResult | null>(null);

  const generate = async () => {
    setStatus("loading");
    setError(null);
    setResult(null);
    setProgress("Checking the signed credential…");
    try {
      const witness = await getZkpWitness(credentialId);
      if (witness.commitment !== commitment || witness.credentialId !== credentialId) {
        throw new Error("The credential commitment did not match this wallet item.");
      }
      setProgress("Generating the proof in this browser…");
      const artifacts = await loadPinnedArtifacts();
      setProgress("Checking the proof locally…");
      const proof = await generateScoreThresholdProof({
        credentialId,
        commitment: witness.commitment,
        threshold,
        witness: witness.witness,
        ...artifacts,
        artifactHashes: witness.artifactHashes,
      });
      setResult(proof);
      setStatus("done");
      setProgress("");
    } catch (err) {
      setStatus("error");
      setProgress("");
      setError(err instanceof Error ? err.message : "Proof generation failed.");
    }
  };

  return (
    <div className="learner-stat-card p-4">
      <p className="text-sm font-semibold text-[#023E8A]">Generate Zero-Knowledge Proof</p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        Prove that your assessment score meets a threshold. The score and blinding factor stay on this device and are not part of the proof.
        This is separate from selective sharing, which creates an HMAC link.
      </p>
      <div className="mt-4 space-y-2">
        <Label htmlFor="zkp-threshold">Public threshold</Label>
        <Input
          id="zkp-threshold"
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <p className="text-xs text-[#64748b]">Default is 60. The proof shows only this threshold and the credential commitment.</p>
      </div>
      <Button type="button" className="mt-4 w-full rounded-xl" disabled={status === "loading"} onClick={() => void generate()}>
        {status === "loading" ? "Generating proof…" : "Generate Zero-Knowledge Proof"}
      </Button>
      {progress ? <p className="mt-3 text-xs text-[#023E8A]">{progress}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
      {result ? (
        <div className="mt-4 space-y-2 text-xs text-[#334155]">
          <p className="font-medium text-[#023E8A]">
            Local check: {result.locallyVerified ? "passed" : "failed"}
          </p>
          <p>This check ran in your browser. It is not a recruiter verification and it is not a trusted server decision.</p>
          <p>Circuit: {result.circuitId}</p>
          <p className="break-all">Credential: {result.credentialId}</p>
          <p>Public signals: threshold {result.publicSignals[0]}, commitment {result.publicSignals[1]}</p>
          <details>
            <summary>Proof object</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(result.proof)}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

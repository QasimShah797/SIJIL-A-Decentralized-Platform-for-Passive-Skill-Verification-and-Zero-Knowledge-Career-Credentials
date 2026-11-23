import "dotenv/config";
import { githubZkp } from "../src/services/github-zkp-workflow.service";

const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";
const repo =
  "QasimShah797/SIJIL-A-Decentralized-Platform-for-Passive-Skill-Verification-and-Zero-Knowledge-Career-Credentials";

async function main() {
  console.log("creating snapshot for", repo);
  const snap = await githubZkp.createSnapshot(userId, repo);
  console.log("snapshot", snap);
  console.log("requesting thr-70 proof...");
  const proof = await githubZkp.requestProof(userId, snap.snapshotId, 70);
  console.log("proof ready", {
    proofId: proof.proofId,
    threshold: proof.threshold,
    commitment: String(proof.commitment).slice(0, 32),
    repo: proof.repositoryFullName,
    signals: proof.publicSignals,
  });
}

main().catch((e: unknown) => {
  const err = e as { statusCode?: number; status?: number; message?: string };
  console.error("FAIL", err?.statusCode ?? err?.status, err?.message ?? e);
  process.exitCode = 1;
});

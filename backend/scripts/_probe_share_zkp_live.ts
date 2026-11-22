import "dotenv/config";
import { walletService } from "../src/services/wallet.service";
import {
  buildShareZkpAttachment,
  moodleCompletionCounts,
  countEligiblePeerReviews,
} from "../src/services/share-zkp.service";

const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";

async function main() {
  const records = await walletService.getCompetencies(userId);
  for (const record of records) {
    const moodle = moodleCompletionCounts(record);
    const peers = countEligiblePeerReviews(record, userId);
    const repos = record.evidencePackage.github.repos?.length ?? 0;
    console.log("---", record.competencyName, record.competencyId);
    console.log("  moodle", moodle, "peers", peers, "repos", repos);
    console.log(
      "  assignments",
      (record.evidencePackage.lms.assignments ?? []).map((a: Record<string, unknown>) => ({
        name: a.name,
        submission_status: a.submission_status,
        status: a.status,
      })),
    );
  }

  const java = records.find((r) => r.competencyName === "Java");
  const ts = records.find((r) => /typescript/i.test(r.competencyName));
  if (!java) throw new Error("Java record missing");

  console.log("\nProving Java Moodle+GitHub+Peer private...");
  const javaOut = await buildShareZkpAttachment({
    userId,
    record: java,
    modes: {
      practical_task_result: "omit",
      github_evidence: "private",
      lms_evidence: "private",
      peer_reviews: "private",
    },
  });
  console.log(
    javaOut.privateResults.map((r) => ({ type: r.claimType, status: r.status, label: r.label })),
  );
  console.log(
    "proofs",
    javaOut.proofs.map((p) => ({ type: p.claimType, thr: p.threshold, verified: p.verified })),
  );

  if (ts) {
    console.log("\nProving Typescript Moodle+Peer private...");
    const tsOut = await buildShareZkpAttachment({
      userId,
      record: ts,
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "private",
        peer_reviews: "private",
      },
    });
    console.log(
      tsOut.privateResults.map((r) => ({ type: r.claimType, status: r.status, label: r.label })),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

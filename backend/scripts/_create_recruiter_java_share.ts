import "dotenv/config";
import { walletService } from "../src/services/wallet.service";

const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";
const javaId = "8da95cbd-dd86-4a43-a23b-a7b004ca708d";
const recruiterId = "2b1c0399-cd1b-46d4-8091-9584663ce516";

async function main() {
  const result = await walletService.shareCompetency(userId, javaId, {
    selectionMode: "custom",
    selectedFields: [
      "competency_name",
      "competency_domain",
      "verification_status",
      "timestamps",
      "learner_name",
    ],
    evidenceModes: {
      practical_task_result: "omit",
      github_evidence: "private",
      lms_evidence: "private",
      peer_reviews: "private",
    },
    shareScope: "selected",
    expiresInDays: 7,
    recipientUserId: recruiterId,
  });
  console.log(JSON.stringify({
    shareUrl: result.shareUrl,
    token: result.token,
    delivery: result.delivery,
    recipientName: result.recipientName,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

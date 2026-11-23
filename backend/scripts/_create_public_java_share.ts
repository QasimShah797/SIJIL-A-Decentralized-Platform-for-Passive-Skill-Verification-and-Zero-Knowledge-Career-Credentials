import "dotenv/config";
import { writeFileSync } from "node:fs";
import { walletService } from "../src/services/wallet.service";

const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";
const javaId = "8da95cbd-dd86-4a43-a23b-a7b004ca708d";

async function main() {
  const result = await walletService.shareCompetency(userId, javaId, {
    selectionMode: "custom",
    selectedFields: [
      "competency_name",
      "competency_domain",
      "verification_status",
      "timestamps",
    ],
    evidenceModes: {
      practical_task_result: "omit",
      github_evidence: "private",
      lms_evidence: "private",
      peer_reviews: "private",
    },
    shareScope: "selected",
    expiresInDays: 7,
  });
  const out = {
    shareUrl: result.shareUrl,
    token: result.token,
    competencyUrl: `${result.shareUrl}/competency/${javaId}`,
  };
  writeFileSync("scripts/_last_public_java_share.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  // Force exit — snarkjs keeps the event loop alive.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

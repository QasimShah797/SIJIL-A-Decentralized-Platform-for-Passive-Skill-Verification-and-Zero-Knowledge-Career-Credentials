import "dotenv/config";
import { writeFileSync } from "node:fs";
import { walletService } from "../src/services/wallet.service";
import { assertNoPrivateWitnessLeak } from "../src/services/share-zkp.service";

const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";
const javaId = "8da95cbd-dd86-4a43-a23b-a7b004ca708d";

async function main() {
  const result = await walletService.shareCompetency(userId, javaId, {
    selectionMode: "custom",
    selectedFields: [
      "competency_name",
      "competency_domain",
      "verification_status",
      "lms_evidence",
      "github_evidence",
      "peer_reviews",
      "practical_task_result",
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

  writeFileSync(
    "scripts/_last_share_url.txt",
    `${result.shareUrl}\n${result.token}\n`,
    "utf8",
  );

  const presentation = await walletService.getPublicCredential(result.token);
  const disclosed = (presentation as { disclosedPayload?: Record<string, unknown> }).disclosedPayload
    ?? (presentation as unknown as Record<string, unknown>);
  assertNoPrivateWitnessLeak(disclosed as Record<string, unknown>);

  console.log("SHARE_URL", result.shareUrl);
  console.log("status", (presentation as { status?: unknown }).status);
  console.log("privateResults", (disclosed as { privateResults?: unknown }).privateResults
    ?? (presentation as { privateResults?: unknown }).privateResults);
  console.log("DONE");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

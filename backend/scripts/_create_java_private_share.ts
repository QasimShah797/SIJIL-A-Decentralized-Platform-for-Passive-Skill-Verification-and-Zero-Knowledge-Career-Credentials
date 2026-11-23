import "dotenv/config";
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

  const presentation = await walletService.getPublicPresentation(result.token);
  const payload = (presentation as { disclosedPayload?: Record<string, unknown> }).disclosedPayload
    ?? (presentation as { payload?: Record<string, unknown> }).payload
    ?? {};
  assertNoPrivateWitnessLeak(payload as Record<string, unknown>);

  const privateResults = (payload as { privateResults?: Array<Record<string, unknown>> }).privateResults ?? [];
  console.log(JSON.stringify({
    shareUrl: result.shareUrl,
    token: result.token,
    delivery: result.delivery,
    privateResults: privateResults.map((r) => ({
      claimType: r.claimType,
      status: r.status,
      label: r.label,
    })),
    hasZkProofs: Array.isArray((payload as { zkProofs?: unknown[] }).zkProofs)
      ? (payload as { zkProofs: unknown[] }).zkProofs.length
      : 0,
    leakCheck: "ok",
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

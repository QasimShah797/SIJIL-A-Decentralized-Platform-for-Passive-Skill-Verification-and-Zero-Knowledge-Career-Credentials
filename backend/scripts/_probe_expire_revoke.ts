import "dotenv/config";
import { walletService } from "../src/services/wallet.service";
import { getServiceSupabase } from "../src/config/supabase";
import { recruiterService } from "../src/services/recruiter.service";
import { ROLES } from "../src/constants/roles";
import type { AuthCaller } from "../src/services/learner-access";

const LEARNER = "f0620086-9dbf-4bdf-a743-331111353d3e";
const RECRUITER = "2b1c0399-cd1b-46d4-8091-9584663ce516";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const tsId = "cb3914a3-db4e-4d97-95e5-2ecec87c9f29";

async function main() {
  const share = await walletService.shareCompetency(LEARNER, tsId, {
    selectionMode: "custom",
    selectedFields: ["competency_name", "learner_name"],
    evidenceModes: {
      practical_task_result: "omit",
      github_evidence: "omit",
      lms_evidence: "omit",
      peer_reviews: "omit",
    },
    shareScope: "selected",
    expiresInDays: 1,
    recipientUserId: RECRUITER,
  });
  console.log("share", share.shareId, share.token.slice(0, 12));

  const db = getServiceSupabase();
  await db
    .from("selective_disclosure_presentations")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", share.shareId);

  const p = await walletService.getPublicPresentation(share.token);
  console.log("expired presentation", {
    expired: p.verification.expired,
    revoked: p.verification.revoked,
    result: p.verification.result,
    payloadKeys: Object.keys(p.disclosedPayload ?? {}),
  });

  const caller: AuthCaller = { id: RECRUITER, roles: [ROLES.RECRUITER] };
  const detail = await recruiterService.getCandidate(LEARNER, caller);
  console.log(
    "profile has expired id?",
    (detail?.sharedCredentials ?? []).some((c) => c.presentationId === share.shareId),
  );

  const otherCaller: AuthCaller = { id: OTHER, roles: [ROLES.RECRUITER] };
  const otherDir = await recruiterService.search({}, OTHER);
  console.log("other directory count", otherDir.length, "has eesha", otherDir.some((c) => c.id === LEARNER));
  const otherDetail = await recruiterService.getCandidate(LEARNER, otherCaller).catch((e) => {
    console.log("other detail error", e instanceof Error ? e.message : e);
    return null;
  });
  if (otherDetail) {
    const kinds = otherDetail.sharedCredentials.map((c) => ({
      id: c.presentationId,
      skill: c.skill,
      shareKind: (c.disclosedPayload as Record<string, unknown>)?.shareKind,
      recipient: (c.disclosedPayload as Record<string, unknown>)?.recipientUserId,
    }));
    console.log("other detail shares", JSON.stringify(kinds, null, 2));
    console.log("includes our direct share?", kinds.some((k) => k.id === share.shareId));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

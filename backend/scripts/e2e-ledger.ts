/**
 * End-to-end ledger check against a running Fabric test-network.
 *
 * Issues a credential, waits for the outbox to anchor it, verifies (verified),
 * tampers the Postgres row, verifies (tampered), restores the hash, revokes,
 * and verifies (revoked).
 *
 * Prerequisites:
 *   1. Fabric test-network up: from repo root, ./fabric/scripts/setup.sh
 *   2. backend/.env with FABRIC_ENABLED=true, issuer keys, and Fabric paths
 *   3. At least one learner_profiles row (or set E2E_LEARNER_ID)
 *
 * Usage (from backend/):
 *   npm run e2e:ledger
 */
import { env } from "../src/config/env";
import { PIPELINE_STAGE, SKILL_STATUS } from "../src/constants/status";
import { credentialsService } from "../src/services/credentials.service";
import {
  retryCredentialAnchor,
  supabaseAnchorStore,
} from "../src/services/anchor-worker.service";
import { getLedgerService } from "../src/services/ledger.factory";
import { supabaseService } from "../src/services/supabase.service";
import {
  loadCredentialByIdOrUri,
  revokeIssuedCredential,
  verifyPublicCredential,
} from "../src/services/credential-verify.service";
import { hashEvidenceRecord } from "../src/utils/evidence-hash";

const ANCHOR_WAIT_MS = 90_000;
const POLL_MS = 2_000;

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function expectEqual(actual: string, expected: string, step: string): void {
  if (actual !== expected) {
    fail(`${step}: expected ${expected}, got ${actual}`);
  }
  console.log(`ok    ${step} → ${expected}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveLearnerId(): Promise<string> {
  const fromEnv = process.env.E2E_LEARNER_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await supabaseService.client
    .from("learner_profiles")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (error) fail(`Could not load learner_profiles: ${error.message}`);
  if (data?.user_id && typeof data.user_id === "string") return data.user_id;

  const { data: roleRow, error: roleErr } = await supabaseService.client
    .from("user_roles")
    .select("user_id")
    .eq("role", "learner")
    .limit(1)
    .maybeSingle();
  if (roleErr) fail(`Could not load user_roles: ${roleErr.message}`);
  if (roleRow?.user_id && typeof roleRow.user_id === "string") return roleRow.user_id;

  fail("No learner found. Set E2E_LEARNER_ID to a learner user UUID.");
}

async function createWalletReadySkill(userId: string): Promise<string> {
  const name = `E2E Ledger ${Date.now()}`;
  const { data, error } = await supabaseService.client
    .from("declared_skills")
    .insert({
      user_id: userId,
      name,
      domain: "E2E",
      description: "Temporary skill for ledger e2e",
      status: SKILL_STATUS.WALLET_READY,
      pipeline_stage: PIPELINE_STAGE.WALLET_READY,
    })
    .select("id")
    .single();
  if (error || !data?.id) fail(`Could not create e2e skill: ${error?.message ?? "no id"}`);
  const skillId = String(data.id);

  const title = "E2E LMS evidence";
  const source = "LMS";
  const contentHash = hashEvidenceRecord({ source, title });
  const { error: evidenceErr } = await supabaseService.client.from("supporting_records").insert({
    user_id: userId,
    skill_id: skillId,
    source,
    title,
    url: null,
    occurred_at: new Date().toISOString(),
    content_hash: contentHash,
  });
  if (evidenceErr) fail(`Could not create e2e evidence: ${evidenceErr.message}`);
  return skillId;
}

async function waitUntilAnchored(idOrUri: string): Promise<void> {
  const retry = await retryCredentialAnchor(idOrUri);
  if (retry.anchorStatus === "anchored") return;

  const deadline = Date.now() + ANCHOR_WAIT_MS;
  while (Date.now() < deadline) {
    const row = await supabaseAnchorStore.getByIdOrUri(idOrUri);
    if (row?.anchorStatus === "anchored") return;
    if (row?.anchorStatus === "failed") {
      fail(`Anchor failed: ${row.anchorTxId ?? "no tx"} (status failed)`);
    }
    await sleep(POLL_MS);
  }
  fail(`Timed out waiting for anchor_status=anchored (${ANCHOR_WAIT_MS}ms)`);
}

async function main(): Promise<void> {
  if (!env.FABRIC_ENABLED) {
    fail("FABRIC_ENABLED must be true and the Fabric test-network must be running.");
  }
  if (!getLedgerService().isEnabled()) {
    fail("Ledger client is not enabled. Check FABRIC_* paths and peer connectivity.");
  }

  const learnerId = await resolveLearnerId();
  const skillId = await createWalletReadySkill(learnerId);
  console.log(`e2e   learner=${learnerId} skill=${skillId}`);

  const issued = await credentialsService.issue(learnerId, { skillId });
  const credentialId = issued.id;
  const row = await loadCredentialByIdOrUri(credentialId);
  if (!row) fail("Issued credential row not found");
  console.log(`e2e   issued ${credentialId} dbId=${row.id}`);

  await waitUntilAnchored(row.id);

  const afterAnchor = await verifyPublicCredential(row.id);
  expectEqual(afterAnchor.status, "verified", "verify after anchor");

  const originalHash = row.credential_hash;
  const originalDocument = row.credential_document;
  if (!originalHash) fail("Issued credential has no credential_hash");

  const tamperedHash = originalHash === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64);
  const { error: tamperErr } = await supabaseService.client
    .from("credentials")
    .update({
      credential_hash: tamperedHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (tamperErr) fail(`Could not tamper credential row: ${tamperErr.message}`);

  const afterTamper = await verifyPublicCredential(row.id);
  expectEqual(afterTamper.status, "tampered", "verify after DB tamper");

  const { error: restoreErr } = await supabaseService.client
    .from("credentials")
    .update({
      credential_hash: originalHash,
      credential_document: originalDocument,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (restoreErr) fail(`Could not restore credential hash: ${restoreErr.message}`);

  await revokeIssuedCredential(row.id, "e2e-ledger");
  const afterRevoke = await verifyPublicCredential(row.id);
  expectEqual(afterRevoke.status, "revoked", "verify after revoke");

  console.log("PASS  ledger e2e (verified → tampered → revoked)");
}

main()
  .catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
  })
  .finally(() => {
    getLedgerService().close();
  });

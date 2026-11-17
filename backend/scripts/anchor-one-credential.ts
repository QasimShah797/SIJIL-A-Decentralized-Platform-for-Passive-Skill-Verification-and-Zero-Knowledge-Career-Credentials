import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createLedgerService } from "../src/services/ledger.service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const CREDENTIAL_ID = "62a387bc-537d-4cb4-a8d4-6e7bb9dac8f9";

async function main() {
  if (process.env.FABRIC_ENABLED !== "false") {
    throw new Error("Keep FABRIC_ENABLED=false for isolated anchoring");
  }

  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: row, error } = await db
    .from("credentials")
    .select("id, credential_hash, issuer_did, holder_did, valid_from, anchor_status")
    .eq("id", CREDENTIAL_ID)
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Credential not found");
  }

  if (row.anchor_status !== "pending") {
    throw new Error(`Unexpected status: ${row.anchor_status}`);
  }

  if (!row.credential_hash || !row.issuer_did || !row.holder_did || !row.valid_from) {
    throw new Error("Required credential fields are missing");
  }

  const ledger = createLedgerService({
    enabled: true,
    peerEndpoint: process.env.FABRIC_PEER_ENDPOINT!,
    mspId: process.env.FABRIC_MSP_ID!,
    channel: process.env.FABRIC_CHANNEL!,
    chaincode: process.env.FABRIC_CHAINCODE!,
    contractName: process.env.FABRIC_CONTRACT_NAME || "CredentialAnchor",
    certPath: process.env.FABRIC_CERT_PATH!,
    keyPath: process.env.FABRIC_KEY_PATH!,
    tlsCertPath: process.env.FABRIC_TLS_CERT_PATH!,
    tlsOverrideHost: process.env.FABRIC_TLS_OVERRIDE_HOST || undefined,
  });

  try {
    console.log("Anchoring selected Typescript credential...");

    const result = await ledger.anchorCredential({
      credentialId: row.id,
      hash: row.credential_hash,
      issuerDid: row.issuer_did,
      holderDid: row.holder_did,
      issuedAt: row.valid_from,
    });

    console.log("Fabric transaction committed:", result.txId);

    const verification = await ledger.verifyCredential(
      row.id,
      row.credential_hash
    );

    if (!verification.exists || !verification.hashMatches) {
      throw new Error("Blockchain verification failed");
    }

    const { data: updated, error: updateError } = await db
      .from("credentials")
      .update({
        anchor_status: "anchored",
        anchor_tx_id: result.txId,
        anchored_at: new Date().toISOString(),
        anchor_last_error: null,
      })
      .eq("id", CREDENTIAL_ID)
      .eq("anchor_status", "pending")
      .select("id, anchor_status, anchor_tx_id")
      .single();

    if (updateError || !updated) {
      throw new Error(
        "Fabric anchor succeeded but database update failed: " +
        (updateError?.message ?? "No matching pending row")
      );
    }

    console.log("SUCCESS: Credential anchored and verified!");
    console.log("Status:", updated.anchor_status);
    console.log("Transaction ID:", updated.anchor_tx_id);
  } finally {
    ledger.close();
  }
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
});

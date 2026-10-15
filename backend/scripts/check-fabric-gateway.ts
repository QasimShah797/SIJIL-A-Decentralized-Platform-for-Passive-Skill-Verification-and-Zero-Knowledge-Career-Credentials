/**
 * Read-only Fabric Gateway connectivity check.
 *
 * Opens a TLS connection to the configured peer and calls evaluateTransaction
 * on CredentialAnchor.VerifyCredential. Never calls submitTransaction.
 *
 * Does not start the HTTP server or the anchoring worker.
 * Leaves FABRIC_ENABLED unchanged in backend/.env (expected: false).
 * Loads backend/.env Fabric settings only — does not import env.ts, which
 * currently rejects empty optional keys (issuer/wallet) unrelated to this check.
 *
 * Usage (from backend/):
 *   npm run check:fabric
 */
import path from "node:path";
import dotenv from "dotenv";
import { createLedgerService } from "../src/services/ledger.service";
import { publicErrorMessage } from "../src/services/ledger.errors";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function envValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const PROBE_ID = "sijil-readonly-gateway-probe";
const PROBE_HASH = "0";

function fail(message: string, extra?: string): never {
  console.error(`FAIL  ${message}`);
  if (extra) {
    console.error(`      ${extra}`);
  }
  process.exit(1);
}

function classify(message: string): "gateway" | "channel" | "chaincode" | "identity" | "unknown" {
  const m = message.toLowerCase();
  if (
    /econnrefused|enotfound|etimedout|unavailable|dns|14 unavailable|connect failed|failed to connect|ssl|tls|certificate/.test(
      m,
    )
  ) {
    return "gateway";
  }
  if (/channel/.test(m) && /not found|does not exist|unknown/.test(m)) {
    return "channel";
  }
  if (/chaincode|contract|credentialanchor/.test(m)) {
    return "chaincode";
  }
  if (/msp|identity|access denied|authentication|endorser|creator/.test(m)) {
    return "identity";
  }
  return "unknown";
}

async function main(): Promise<void> {
  const enabledRaw = envValue("FABRIC_ENABLED").toLowerCase();
  if (enabledRaw === "true" || enabledRaw === "1") {
    fail(
      "FABRIC_ENABLED is true. This check must run with FABRIC_ENABLED=false so the anchoring worker stays off.",
    );
  }

  const peerEndpoint = envValue("FABRIC_PEER_ENDPOINT");
  const mspId = envValue("FABRIC_MSP_ID");
  const channel = envValue("FABRIC_CHANNEL");
  const chaincode = envValue("FABRIC_CHAINCODE");
  const contractName = envValue("FABRIC_CONTRACT_NAME") || "CredentialAnchor";
  const certPath = envValue("FABRIC_CERT_PATH");
  const keyPath = envValue("FABRIC_KEY_PATH");
  const tlsCertPath = envValue("FABRIC_TLS_CERT_PATH");
  const tlsOverrideHost = envValue("FABRIC_TLS_OVERRIDE_HOST") || undefined;
  const missing = [
    ["FABRIC_PEER_ENDPOINT", peerEndpoint],
    ["FABRIC_MSP_ID", mspId],
    ["FABRIC_CHANNEL", channel],
    ["FABRIC_CHAINCODE", chaincode],
    ["FABRIC_CERT_PATH", certPath],
    ["FABRIC_KEY_PATH", keyPath],
    ["FABRIC_TLS_CERT_PATH", tlsCertPath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    fail(`Missing Fabric settings: ${missing.join(", ")}`);
  }

  console.log("check  read-only Fabric Gateway evaluate (FABRIC_ENABLED remains false)");
  console.log(`check  peer=configured msp=${mspId} channel=${channel} chaincode=${chaincode}`);
  console.log("check  identity=Org1 admin paths set; PEM contents not logged");

  const ledger = createLedgerService({
    enabled: true,
    peerEndpoint,
    mspId,
    channel,
    chaincode,
    contractName,
    certPath,
    keyPath,
    tlsCertPath,
    tlsOverrideHost,
  });

  try {
    const result = await ledger.verifyCredential(PROBE_ID, PROBE_HASH);
    if (typeof result.exists !== "boolean" || typeof result.hashMatches !== "boolean") {
      fail("Chaincode returned an unexpected payload shape");
    }
    console.log("ok     Fabric Gateway connection: success");
    console.log("ok     Channel connection: success");
    console.log("ok     Chaincode response: success");
    console.log("ok     Identity accepted: success (evaluate endorsed)");
    console.log(
      `ok     VerifyCredential probe exists=${result.exists} hashMatches=${result.hashMatches} (expected missing probe)`,
    );
  } catch (err) {
    const message = publicErrorMessage(err);
    const kind = classify(message);
    console.error("FAIL  Fabric Gateway evaluate failed");
    console.error(`      stage=${kind}`);
    console.error(`      error=${message}`);
    process.exit(1);
  } finally {
    ledger.close();
  }
}

main().catch((err: unknown) => {
  fail(publicErrorMessage(err));
});

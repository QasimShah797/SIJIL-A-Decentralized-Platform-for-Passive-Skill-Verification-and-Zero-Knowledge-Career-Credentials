/**
 * Lazy Fabric ledger singleton wired from env. Import this from server/health, not from unit tests.
 */
import { env } from "../config/env";
import { createLedgerService, type LedgerServiceConfig } from "./ledger.service";
import type { LedgerPort } from "./ledger.types";

let instance: LedgerPort | undefined;
let evaluateInstance: LedgerPort | undefined;

function fabricEnabledConfig(): LedgerServiceConfig | null {
  if (
    !env.FABRIC_PEER_ENDPOINT
    || !env.FABRIC_MSP_ID
    || !env.FABRIC_CHANNEL
    || !env.FABRIC_CHAINCODE
    || !env.FABRIC_CERT_PATH
    || !env.FABRIC_KEY_PATH
    || !env.FABRIC_TLS_CERT_PATH
  ) {
    return null;
  }
  return {
    enabled: true,
    peerEndpoint: env.FABRIC_PEER_ENDPOINT,
    mspId: env.FABRIC_MSP_ID,
    channel: env.FABRIC_CHANNEL,
    chaincode: env.FABRIC_CHAINCODE,
    contractName: env.FABRIC_CONTRACT_NAME,
    certPath: env.FABRIC_CERT_PATH,
    keyPath: env.FABRIC_KEY_PATH,
    tlsCertPath: env.FABRIC_TLS_CERT_PATH,
    tlsOverrideHost: env.FABRIC_TLS_OVERRIDE_HOST,
  };
}

export function fabricConfigFromEnv(): LedgerServiceConfig {
  if (!env.FABRIC_ENABLED) {
    return { enabled: false };
  }
  const configured = fabricEnabledConfig();
  if (!configured) {
    throw new Error("FABRIC_ENABLED=true requires Fabric peer, MSP, channel, chaincode, and TLS paths");
  }
  return configured;
}

/** Submit/worker client. Stays disabled when FABRIC_ENABLED=false. */
export function getLedgerService(): LedgerPort {
  instance ??= createLedgerService(fabricConfigFromEnv());
  return instance;
}

/**
 * Read-only evaluate client. Uses configured Gateway paths even when the
 * submit worker is off, so public verify can confirm an existing anchor
 * without enabling AnchorCredential submits.
 */
export function getEvaluateLedgerService(): LedgerPort {
  if (env.FABRIC_ENABLED) {
    return getLedgerService();
  }
  evaluateInstance ??= createLedgerService(fabricEnabledConfig() ?? { enabled: false });
  return evaluateInstance;
}

export function resetLedgerServiceForTests(replacement?: LedgerPort): void {
  instance?.close();
  evaluateInstance?.close();
  instance = replacement;
  evaluateInstance = replacement;
}

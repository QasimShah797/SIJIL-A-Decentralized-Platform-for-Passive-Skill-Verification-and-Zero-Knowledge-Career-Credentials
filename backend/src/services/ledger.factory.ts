/**
 * Lazy Fabric ledger singleton wired from env. Import this from server/health, not from unit tests.
 */
import { env } from "../config/env";
import { createLedgerService, type LedgerServiceConfig } from "./ledger.service";
import type { LedgerPort } from "./ledger.types";

let instance: LedgerPort | undefined;

export function fabricConfigFromEnv(): LedgerServiceConfig {
  if (!env.FABRIC_ENABLED) {
    return { enabled: false };
  }
  return {
    enabled: true,
    peerEndpoint: requireFabric(env.FABRIC_PEER_ENDPOINT, "FABRIC_PEER_ENDPOINT"),
    mspId: requireFabric(env.FABRIC_MSP_ID, "FABRIC_MSP_ID"),
    channel: requireFabric(env.FABRIC_CHANNEL, "FABRIC_CHANNEL"),
    chaincode: requireFabric(env.FABRIC_CHAINCODE, "FABRIC_CHAINCODE"),
    contractName: env.FABRIC_CONTRACT_NAME,
    certPath: requireFabric(env.FABRIC_CERT_PATH, "FABRIC_CERT_PATH"),
    keyPath: requireFabric(env.FABRIC_KEY_PATH, "FABRIC_KEY_PATH"),
    tlsCertPath: requireFabric(env.FABRIC_TLS_CERT_PATH, "FABRIC_TLS_CERT_PATH"),
    tlsOverrideHost: env.FABRIC_TLS_OVERRIDE_HOST,
  };
}

export function getLedgerService(): LedgerPort {
  instance ??= createLedgerService(fabricConfigFromEnv());
  return instance;
}

export function resetLedgerServiceForTests(replacement?: LedgerPort): void {
  instance?.close();
  instance = replacement;
}

function requireFabric(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required when FABRIC_ENABLED=true`);
  }
  return value;
}

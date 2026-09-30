/**
 * Fabric Gateway client for CredentialAnchor. Disabled by default (FABRIC_ENABLED=false).
 * Never logs private keys or certificate PEM contents.
 */
import { promises as fs } from "node:fs";
import { createPrivateKey, type KeyObject } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { connect, hash, signers, type Contract, type Gateway } from "@hyperledger/fabric-gateway";
import {
  LedgerDisabledError,
  LedgerPermanentError,
  isAlreadyRevokedError,
  isDuplicateAnchorError,
  publicErrorMessage,
} from "./ledger.errors";
import type {
  AnchorCredentialInput,
  AnchorResult,
  LedgerHistoryEntry,
  LedgerPort,
  VerifyCredentialResult,
} from "./ledger.types";

const CONTRACT_NAME_DEFAULT = "CredentialAnchor";

export interface FabricEnabledConfig {
  enabled: true;
  peerEndpoint: string;
  mspId: string;
  channel: string;
  chaincode: string;
  contractName?: string;
  certPath: string;
  keyPath: string;
  tlsCertPath: string;
  tlsOverrideHost?: string;
}

export interface FabricDisabledConfig {
  enabled: false;
}

export type LedgerServiceConfig = FabricEnabledConfig | FabricDisabledConfig;

interface GatewayConnection {
  client: grpc.Client;
  gateway: Gateway;
}

export function createLedgerService(config: LedgerServiceConfig): LedgerPort {
  return new LedgerService(config);
}

export class LedgerService implements LedgerPort {
  private connection: GatewayConnection | undefined;
  private connecting: Promise<GatewayConnection> | undefined;

  constructor(private readonly config: LedgerServiceConfig) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async isReachable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }
    try {
      await this.verifyCredential("health-probe", "0");
      return true;
    } catch (err) {
      if (err instanceof LedgerDisabledError) {
        return false;
      }
      console.error("[ledger] reachability check failed:", publicErrorMessage(err));
      return false;
    }
  }

  async anchorCredential(input: AnchorCredentialInput): Promise<AnchorResult> {
    const contract = await this.getContract();
    try {
      const commit = await contract.submitAsync("AnchorCredential", {
        arguments: [
          input.credentialId,
          input.hash,
          input.issuerDid,
          input.holderDid,
          input.issuedAt,
        ],
      });
      const status = await commit.getStatus();
      if (!status.successful) {
        throw new Error(`AnchorCredential commit failed (${status.code})`);
      }
      return { txId: status.transactionId };
    } catch (err) {
      if (!isDuplicateAnchorError(err)) {
        throw err;
      }
      const verify = await this.verifyCredential(input.credentialId, input.hash);
      if (verify.exists && verify.hashMatches) {
        const history = await this.getHistory(input.credentialId);
        const last = history[history.length - 1];
        return { txId: last?.txId ?? "already-anchored" };
      }
      throw new LedgerPermanentError(
        `credential ${input.credentialId} is already anchored with a different hash`,
      );
    }
  }

  async revokeCredential(credentialId: string, reason: string): Promise<AnchorResult> {
    const contract = await this.getContract();
    try {
      const commit = await contract.submitAsync("RevokeCredential", {
        arguments: [credentialId, reason],
      });
      const status = await commit.getStatus();
      if (!status.successful) {
        throw new Error(`RevokeCredential commit failed (${status.code})`);
      }
      return { txId: status.transactionId };
    } catch (err) {
      if (!isAlreadyRevokedError(err)) {
        throw err;
      }
      const history = await this.getHistory(credentialId);
      const last = history[history.length - 1];
      return { txId: last?.txId ?? "already-revoked" };
    }
  }

  async verifyCredential(credentialId: string, hashValue: string): Promise<VerifyCredentialResult> {
    const contract = await this.getContract();
    const bytes = await contract.evaluateTransaction("VerifyCredential", credentialId, hashValue);
    return parseVerifyResult(bytes);
  }

  async getHistory(credentialId: string): Promise<LedgerHistoryEntry[]> {
    const contract = await this.getContract();
    const bytes = await contract.evaluateTransaction("GetHistory", credentialId);
    return parseHistory(bytes);
  }

  close(): void {
    const conn = this.connection;
    this.connection = undefined;
    this.connecting = undefined;
    if (!conn) {
      return;
    }
    try {
      conn.gateway.close();
    } catch (err) {
      console.error("[ledger] gateway close failed:", publicErrorMessage(err));
    }
    try {
      conn.client.close();
    } catch (err) {
      console.error("[ledger] grpc close failed:", publicErrorMessage(err));
    }
  }

  private assertEnabled(): FabricEnabledConfig {
    if (!this.config.enabled) {
      throw new LedgerDisabledError();
    }
    return this.config;
  }

  private async getContract(): Promise<Contract> {
    const cfg = this.assertEnabled();
    const conn = await this.ensureConnection(cfg);
    return conn.gateway.getNetwork(cfg.channel).getContract(cfg.chaincode, cfg.contractName ?? CONTRACT_NAME_DEFAULT);
  }

  private async ensureConnection(cfg: FabricEnabledConfig): Promise<GatewayConnection> {
    if (this.connection) {
      return this.connection;
    }
    if (!this.connecting) {
      this.connecting = this.openConnection(cfg).catch((err) => {
        this.connecting = undefined;
        throw err;
      });
    }
    this.connection = await this.connecting;
    return this.connection;
  }

  private async openConnection(cfg: FabricEnabledConfig): Promise<GatewayConnection> {
    console.log(
      `[ledger] connecting msp=${cfg.mspId} channel=${cfg.channel} chaincode=${cfg.chaincode} peer=configured certPath=set tlsPath=set`,
    );

    const tlsRootCert = await fs.readFile(cfg.tlsCertPath);
    const cert = await fs.readFile(cfg.certPath);
    const keyPem = await fs.readFile(cfg.keyPath);
    const privateKey = parsePrivateKey(keyPem);

    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    const clientOptions: grpc.ChannelOptions = {};
    if (cfg.tlsOverrideHost) {
      clientOptions["grpc.ssl_target_name_override"] = cfg.tlsOverrideHost;
      clientOptions["grpc.default_authority"] = cfg.tlsOverrideHost;
    }

    const client = new grpc.Client(cfg.peerEndpoint, tlsCredentials, clientOptions);
    const gateway = connect({
      client,
      identity: { mspId: cfg.mspId, credentials: cert },
      signer: signers.newPrivateKeySigner(privateKey),
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 15_000 }),
      submitOptions: () => ({ deadline: Date.now() + 15_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 30_000 }),
    });

    return { client, gateway };
  }
}

function parsePrivateKey(pem: Buffer): KeyObject {
  return createPrivateKey(pem);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

function parseVerifyResult(bytes: Uint8Array): VerifyCredentialResult {
  const parsed: unknown = JSON.parse(bytesToUtf8(bytes));
  if (!isVerifyResult(parsed)) {
    throw new Error("VerifyCredential returned a malformed payload");
  }
  return parsed;
}

function isVerifyResult(value: unknown): value is VerifyCredentialResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.exists === "boolean" &&
    typeof rec.hashMatches === "boolean" &&
    typeof rec.status === "string"
  );
}

function parseHistory(bytes: Uint8Array): LedgerHistoryEntry[] {
  const parsed: unknown = JSON.parse(bytesToUtf8(bytes));
  if (!Array.isArray(parsed)) {
    throw new Error("GetHistory returned a malformed payload");
  }
  return parsed.map((entry) => parseHistoryEntry(entry));
}

function parseHistoryEntry(value: unknown): LedgerHistoryEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error("GetHistory entry is malformed");
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.txId !== "string" || typeof rec.timestamp !== "string" || typeof rec.isDelete !== "boolean") {
    throw new Error("GetHistory entry is malformed");
  }
  return {
    txId: rec.txId,
    timestamp: rec.timestamp,
    isDelete: rec.isDelete,
    record: parseOptionalRecord(rec.record),
  };
}

function parseOptionalRecord(value: unknown): LedgerHistoryEntry["record"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.credentialId !== "string" ||
    typeof rec.hash !== "string" ||
    typeof rec.issuerDid !== "string" ||
    typeof rec.holderDid !== "string" ||
    typeof rec.issuedAt !== "string" ||
    typeof rec.status !== "string" ||
    typeof rec.revokedAt !== "string" ||
    typeof rec.revocationReason !== "string"
  ) {
    return null;
  }
  return {
    credentialId: rec.credentialId,
    hash: rec.hash,
    issuerDid: rec.issuerDid,
    holderDid: rec.holderDid,
    issuedAt: rec.issuedAt,
    status: rec.status,
    revokedAt: rec.revokedAt,
    revocationReason: rec.revocationReason,
  };
}

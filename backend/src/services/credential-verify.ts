/**
 * Credential integrity + ledger verification. Returns opaque IDs and hashes only.
 */
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";
import { LedgerDisabledError } from "./ledger.errors";
import type { LedgerPort, VerifyCredentialResult } from "./ledger.types";

export type CredentialVerifyStatus =
  | "verified"
  | "tampered"
  | "revoked"
  | "pending_anchor"
  | "ledger_unavailable"
  | "evidence_unavailable"
  | "not_found";

export type CredentialVerifyDetail = "legacy_unverified_evidence";

export interface CredentialVerifySnapshot {
  found: boolean;
  credentialId: string;
  storedHash: string | null;
  storedDocument: unknown;
  proofValue: string | null;
  revokedAt: string | null;
  anchorStatus: string;
  anchorTxId: string | null;
  anchoredAt: string | null;
  storedEvidenceHashes?: string[] | null;
  liveEvidenceHashes?: string[] | null;
  evidenceHashMismatch?: boolean;
  evidenceUnavailable?: boolean;
  legacyUnverifiedEvidence?: boolean;
}

export interface CredentialVerifyResult {
  status: CredentialVerifyStatus;
  credentialId: string;
  hash: string | null;
  anchorTxId: string | null;
  anchoredAt: string | null;
  verifiedAt: string;
  detail?: CredentialVerifyDetail;
}

export function credentialShowsVerified(
  result: Pick<CredentialVerifyResult, "status" | "detail">,
): boolean {
  return result.status === "verified" && result.detail !== "legacy_unverified_evidence";
}

export interface CredentialVerifyDeps {
  verifySignature: (hashHex: string, proofValue: string) => boolean;
  ledger: LedgerPort;
  now?: () => Date;
}

export async function evaluateCredentialVerification(
  snapshot: CredentialVerifySnapshot | null,
  deps: CredentialVerifyDeps,
): Promise<CredentialVerifyResult> {
  const verifiedAt = (deps.now?.() ?? new Date()).toISOString();
  if (!snapshot?.found) {
    return {
      status: "not_found",
      credentialId: snapshot?.credentialId ?? "",
      hash: null,
      anchorTxId: null,
      anchoredAt: null,
      verifiedAt,
    };
  }

  const recomputedHash = recomputeStoredDocumentHash(snapshot.storedDocument);
  if (!recomputedHash || !snapshot.storedHash || recomputedHash !== snapshot.storedHash) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash ?? snapshot.storedHash);
  }

  if (!snapshot.proofValue || !deps.verifySignature(recomputedHash, snapshot.proofValue)) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash);
  }

  if (snapshot.evidenceUnavailable) {
    return baseResult(snapshot, verifiedAt, "evidence_unavailable", recomputedHash);
  }

  if (!snapshot.legacyUnverifiedEvidence && snapshot.evidenceHashMismatch) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash);
  }

  if (
    !snapshot.legacyUnverifiedEvidence &&
    snapshot.storedEvidenceHashes &&
    snapshot.liveEvidenceHashes &&
    !evidenceHashesAgree(snapshot.storedEvidenceHashes, snapshot.liveEvidenceHashes)
  ) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash);
  }

  const detail: CredentialVerifyDetail | undefined = snapshot.legacyUnverifiedEvidence
    ? "legacy_unverified_evidence"
    : undefined;

  if (snapshot.revokedAt) {
    return baseResult(snapshot, verifiedAt, "revoked", recomputedHash, detail);
  }

  const ledgerView = await readLedger(deps.ledger, snapshot.credentialId, recomputedHash);
  if (ledgerView === "unavailable") {
    if (snapshot.anchorStatus !== "anchored") {
      return baseResult(snapshot, verifiedAt, "pending_anchor", recomputedHash, detail);
    }
    return baseResult(snapshot, verifiedAt, "ledger_unavailable", recomputedHash, detail);
  }

  if (!ledgerView.exists) {
    if (snapshot.anchorStatus === "anchored") {
      return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, detail);
    }
    return baseResult(snapshot, verifiedAt, "pending_anchor", recomputedHash, detail);
  }

  if (!ledgerView.hashMatches) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, detail);
  }

  if (ledgerView.status === "revoked") {
    return baseResult(snapshot, verifiedAt, "revoked", recomputedHash, detail);
  }

  return baseResult(snapshot, verifiedAt, "verified", recomputedHash, detail);
}

function evidenceHashesAgree(stored: string[], live: string[]): boolean {
  const left = [...stored].filter((hash) => hash.length > 0).sort();
  const right = [...live].filter((hash) => hash.length > 0).sort();
  if (left.length !== right.length) return false;
  return left.every((hash, index) => hash === right[index]);
}

export function recomputeStoredDocumentHash(document: unknown): string | null {
  if (document === null || document === undefined) {
    return null;
  }
  if (typeof document !== "object") {
    return null;
  }
  try {
    return generateSha256Hash(canonicalizeJson(document));
  } catch {
    return null;
  }
}

function baseResult(
  snapshot: CredentialVerifySnapshot,
  verifiedAt: string,
  status: CredentialVerifyStatus,
  hash: string | null,
  detail?: CredentialVerifyDetail,
): CredentialVerifyResult {
  return {
    status,
    credentialId: snapshot.credentialId,
    hash,
    anchorTxId: snapshot.anchorTxId,
    anchoredAt: snapshot.anchoredAt,
    verifiedAt,
    ...(detail ? { detail } : {}),
  };
}

async function readLedger(
  ledger: LedgerPort,
  credentialId: string,
  hash: string,
): Promise<VerifyCredentialResult | "unavailable"> {
  if (!ledger.isEnabled()) {
    return "unavailable";
  }
  try {
    return await ledger.verifyCredential(credentialId, hash);
  } catch (err) {
    if (err instanceof LedgerDisabledError) {
      return "unavailable";
    }
    return "unavailable";
  }
}

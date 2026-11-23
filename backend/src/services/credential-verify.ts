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
  | "ledger_missing"
  | "ledger_unavailable"
  | "evidence_unavailable"
  | "not_found";

export type CredentialVerifyDetail = "legacy_unverified_evidence";

export type VerificationReason =
  | "valid"
  | "invalid_signature"
  | "invalid_document"
  | "holder_mismatch"
  | "evidence_mismatch"
  | "missing_anchor"
  | "pending_anchor"
  | "ledger_hash_mismatch"
  | "revoked"
  | "revocation_pending"
  | "ledger_unavailable"
  | "evidence_unavailable"
  | "invalid_zkp"
  | "untrusted_issuer"
  | "incomplete"
  | "not_found";

export interface VerificationChecks {
  document: "valid" | "invalid" | "missing" | "not_checked";
  signature: "valid" | "invalid" | "missing" | "not_checked";
  holder: "bound" | "mismatch" | "missing" | "not_checked";
  evidence: "match" | "mismatch" | "unavailable" | "legacy" | "not_checked";
  issuer: "trusted" | "untrusted" | "not_checked";
  anchor: "match" | "missing" | "hash_mismatch" | "pending" | "unavailable" | "not_checked";
  revocation: "active" | "revoked" | "pending" | "not_checked";
  zkp: "valid" | "invalid" | "not_applicable" | "not_checked";
}

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
  holderDid?: string | null;
  issuerDid?: string | null;
  revokeStatus?: string | null;
  /** Present only when this credential carries a Groth16 score proof. */
  zkpValid?: boolean | null;
  zkpApplicable?: boolean;
}

export interface CredentialVerifyResult {
  status: CredentialVerifyStatus;
  credentialId: string;
  hash: string | null;
  anchorTxId: string | null;
  anchoredAt: string | null;
  verifiedAt: string;
  detail?: CredentialVerifyDetail;
  reason: VerificationReason;
  checks: VerificationChecks;
}

export function credentialShowsVerified(
  result: Pick<CredentialVerifyResult, "status" | "detail"> & Partial<Pick<CredentialVerifyResult, "reason" | "checks">>,
): boolean {
  return result.status === "verified"
    && result.detail !== "legacy_unverified_evidence"
    && (result.reason === undefined || result.reason === "valid")
    && result.checks?.zkp !== "invalid"
    && result.checks?.zkp !== "not_checked";
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
      reason: "not_found",
      checks: emptyChecks(),
    };
  }

  const recomputedHash = recomputeStoredDocumentHash(snapshot.storedDocument);
  if (!recomputedHash || !snapshot.storedHash || recomputedHash !== snapshot.storedHash) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash ?? snapshot.storedHash, undefined, "invalid_document");
  }

  if (!snapshot.proofValue || !deps.verifySignature(recomputedHash, snapshot.proofValue)) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "invalid_signature");
  }

  const holderDid = holderDidFromDocument(snapshot.storedDocument);
  if (snapshot.holderDid && holderDid && snapshot.holderDid !== holderDid) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "holder_mismatch");
  }

  const issuerDid = issuerDidFromDocument(snapshot.storedDocument);
  if (snapshot.issuerDid && issuerDid && snapshot.issuerDid !== issuerDid) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "untrusted_issuer");
  }

  if (snapshot.zkpValid === false) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "invalid_zkp");
  }

  if (snapshot.evidenceUnavailable) {
    return baseResult(snapshot, verifiedAt, "evidence_unavailable", recomputedHash, undefined, "evidence_unavailable");
  }

  if (!snapshot.legacyUnverifiedEvidence && snapshot.evidenceHashMismatch) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "evidence_mismatch");
  }

  if (
    !snapshot.legacyUnverifiedEvidence &&
    snapshot.storedEvidenceHashes &&
    snapshot.liveEvidenceHashes &&
    !evidenceHashesAgree(snapshot.storedEvidenceHashes, snapshot.liveEvidenceHashes)
  ) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, undefined, "evidence_mismatch");
  }

  const detail: CredentialVerifyDetail | undefined = snapshot.legacyUnverifiedEvidence
    ? "legacy_unverified_evidence"
    : undefined;

  if (snapshot.revokedAt) {
    const pendingChain = snapshot.revokeStatus === "pending" || snapshot.revokeStatus === "failed";
    return baseResult(
      snapshot,
      verifiedAt,
      "revoked",
      recomputedHash,
      detail,
      pendingChain ? "revocation_pending" : "revoked",
    );
  }

  const ledgerView = await readLedger(deps.ledger, snapshot.credentialId, recomputedHash);
  if (ledgerView === "unavailable") {
    if (snapshot.anchorStatus !== "anchored") {
      return baseResult(snapshot, verifiedAt, "pending_anchor", recomputedHash, detail, "pending_anchor");
    }
    return baseResult(snapshot, verifiedAt, "ledger_unavailable", recomputedHash, detail, "ledger_unavailable");
  }

  if (!ledgerView.exists) {
    // Recorded as anchored but absent from the configured ledger: an anchoring gap, not tampering.
    if (snapshot.anchorStatus === "anchored") {
      return baseResult(snapshot, verifiedAt, "ledger_missing", recomputedHash, detail, "missing_anchor");
    }
    return baseResult(snapshot, verifiedAt, "pending_anchor", recomputedHash, detail, "pending_anchor");
  }

  if (!ledgerView.hashMatches) {
    return baseResult(snapshot, verifiedAt, "tampered", recomputedHash, detail, "ledger_hash_mismatch");
  }

  if (ledgerView.status === "revoked") {
    return baseResult(snapshot, verifiedAt, "revoked", recomputedHash, detail, "revoked");
  }

  if (snapshot.revokeStatus === "pending" || snapshot.revokeStatus === "failed") {
    return baseResult(snapshot, verifiedAt, "revoked", recomputedHash, detail, "revocation_pending");
  }

  // A stored assessment commitment means a threshold proof can be checked later.
  // It is not an unfinished credential. checks.zkp stays "not_checked" until a
  // proof is supplied, and credentialShowsVerified refuses the overall badge then.
  return baseResult(snapshot, verifiedAt, "verified", recomputedHash, detail, "valid");
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
  reason?: VerificationReason,
): CredentialVerifyResult {
  const resolved = reason ?? "incomplete";
  return {
    status,
    credentialId: snapshot.credentialId,
    hash,
    anchorTxId: snapshot.anchorTxId,
    anchoredAt: snapshot.anchoredAt,
    verifiedAt,
    reason: resolved,
    checks: checksFor(snapshot, resolved),
    ...(detail ? { detail } : {}),
  };
}

function emptyChecks(): VerificationChecks {
  return {
    document: "missing",
    signature: "not_checked",
    holder: "missing",
    evidence: "not_checked",
    issuer: "not_checked",
    anchor: "not_checked",
    revocation: "not_checked",
    zkp: "not_applicable",
  };
}

function checksFor(snapshot: CredentialVerifySnapshot, reason: VerificationReason): VerificationChecks {
  const documentOk = reason !== "invalid_document" && reason !== "not_found";
  const signatureOk = documentOk && reason !== "invalid_signature";
  return {
    document: reason === "not_found" ? "missing" : documentOk ? "valid" : "invalid",
    signature: !documentOk ? "not_checked" : snapshot.proofValue ? (signatureOk ? "valid" : "invalid") : "missing",
    holder: reason === "holder_mismatch" ? "mismatch" : snapshot.holderDid ? "bound" : "not_checked",
    evidence: snapshot.evidenceUnavailable
      ? "unavailable"
      : snapshot.legacyUnverifiedEvidence
        ? "legacy"
        : reason === "evidence_mismatch"
          ? "mismatch"
          : signatureOk ? "match" : "not_checked",
    issuer: reason === "untrusted_issuer" ? "untrusted" : snapshot.issuerDid ? "trusted" : "not_checked",
    anchor: reason === "ledger_hash_mismatch"
      ? "hash_mismatch"
      : reason === "missing_anchor"
        ? "missing"
        : reason === "ledger_unavailable"
          ? "unavailable"
          : reason === "pending_anchor" || reason === "incomplete"
            ? "pending"
            : reason === "valid" || reason === "revoked" || reason === "revocation_pending"
              ? "match"
              : "not_checked",
    revocation: reason === "revoked"
      ? "revoked"
      : reason === "revocation_pending"
        ? "pending"
        : signatureOk ? "active" : "not_checked",
    zkp: snapshot.zkpValid === false
      ? "invalid"
      : snapshot.zkpValid === true
        ? "valid"
        : snapshot.zkpApplicable
          ? "not_checked"
          : "not_applicable",
  };
}

function holderDidFromDocument(document: unknown): string | null {
  if (!document || typeof document !== "object") return null;
  const subject = (document as { credentialSubject?: { id?: unknown } }).credentialSubject;
  return typeof subject?.id === "string" ? subject.id : null;
}

function issuerDidFromDocument(document: unknown): string | null {
  if (!document || typeof document !== "object") return null;
  const issuer = (document as { issuer?: unknown }).issuer;
  return typeof issuer === "string" ? issuer : null;
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

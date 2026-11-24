/**
 * Recruiter SSI verify helpers — map backend crypto results to UI states.
 * "Verified" is only allowed when the backend status confirms a successful check.
 */
import { shareShowsVerified } from "@/lib/ledger-status";
import type { LedgerVerifyResult } from "@/services/api/ledger.api";

export type SsiVerifyUiState =
  | "idle"
  | "loading"
  | "verified"
  | "failed"
  | "expired"
  | "revoked"
  | "pending_anchor"
  | "evidence_unavailable"
  | "unable";

export type DisclosedCredentialIdentity = {
  issuer: string | null;
  issuedAt: string | null;
  did: string | null;
  credentialId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

/** Pull issuer / issue date / DID only from already-disclosed share payload fields. */
export function extractDisclosedCredentialIdentity(
  payload: Record<string, unknown> | null | undefined,
  fallbackCredentialId?: string | null,
): DisclosedCredentialIdentity {
  const root = payload ?? {};
  const learner = asRecord(root.learner) ?? {};
  const recruiterInfo = asRecord(root.recruiterCredentialInfo);
  const timestamps = asRecord(root.timestamps);
  const meta = asRecords(root.credentialMetadata)[0] ?? {};
  const disclosedFields = Array.isArray(root.disclosedFields) ? root.disclosedFields : [];

  const fieldValue = (id: string) => {
    for (const row of disclosedFields) {
      const record = asRecord(row);
      if (!record) continue;
      if (asText(record.id) === id) return asText(record.value);
    }
    return null;
  };

  const issuer = asText(recruiterInfo?.issuer)
    ?? asText(meta.issuer_name)
    ?? asText(meta.issuer)
    ?? fieldValue("issuer")
    ?? fieldValue("issuerDid")
    ?? asText(meta.issuer_did)
    ?? null;

  const issuedAt = asText(timestamps?.credentialIssuedAt)
    ?? asText(recruiterInfo?.issuedAt)
    ?? asText(meta.valid_from)
    ?? asText(meta.issued_at)
    ?? asText(meta.created_at)
    ?? fieldValue("issuedAt")
    ?? fieldValue("validFrom")
    ?? null;

  const did = asText(learner.did)
    ?? asText(meta.holder_did)
    ?? fieldValue("holderDid")
    ?? fieldValue("learner_did")
    ?? null;

  const credentialId = asText(meta.id)
    ?? asText(meta.credential_id)
    ?? asText(meta.credential_uri)
    ?? asText(fallbackCredentialId)
    ?? null;

  return { issuer, issuedAt, did, credentialId };
}

export function pickSharedCredentialId(input: {
  versionCredentialId?: string | null;
  payload?: Record<string, unknown> | null;
}): string | null {
  const fromVersions = asText(input.versionCredentialId);
  if (fromVersions) return fromVersions;
  return extractDisclosedCredentialIdentity(input.payload).credentialId;
}

export function mapVerifyApiError(message: string): SsiVerifyUiState {
  const lower = message.toLowerCase();
  if (/410/.test(message) && /expir/i.test(lower)) return "expired";
  if (/410/.test(message) && /revok/i.test(lower)) return "revoked";
  if (/403|not authorized|forbidden/i.test(lower)) return "unable";
  if (/expir/i.test(lower)) return "expired";
  if (/revok/i.test(lower)) return "revoked";
  return "unable";
}

/**
 * Share / wallet "Verified" badges — still refuse when ZKP was applicable but not checked.
 */
export function mapLedgerVerifyToUiState(result: LedgerVerifyResult | null | undefined): SsiVerifyUiState {
  if (!result) return "unable";
  if (result.status === "revoked" || result.checks?.revocation === "revoked") return "revoked";
  if (result.status === "tampered") return "failed";
  if (result.status === "pending_anchor") return "pending_anchor";
  if (result.status === "evidence_unavailable") return "evidence_unavailable";
  if (
    shareShowsVerified({
      ledgerStatus: result.status,
      detail: result.detail,
      reason: result.reason,
      zkp: result.checks?.zkp,
    })
  ) {
    return "verified";
  }
  if (
    result.status === "ledger_missing"
    || result.status === "ledger_unavailable"
    || result.status === "not_found"
    || result.detail === "legacy_unverified_evidence"
    || result.checks?.zkp === "not_checked"
  ) {
    return "unable";
  }
  return "failed";
}

/**
 * SSI Verify Credential card — signature, issuer authenticity, and credential status.
 * Assessment ZKP proofs are requested separately; `zkp: not_checked` must not block a
 * successful integrity+ledger result. Never upgrades a non-verified backend status.
 */
export function mapSsiCredentialVerifyToUiState(
  result: LedgerVerifyResult | null | undefined,
): SsiVerifyUiState {
  if (!result) return "unable";
  if (result.status === "revoked" || result.checks?.revocation === "revoked") return "revoked";
  if (result.checks?.zkp === "invalid" || result.reason === "invalid_zkp") return "failed";
  if (result.status === "tampered") return "failed";
  if (result.status === "pending_anchor" || result.reason === "pending_anchor") return "pending_anchor";
  if (result.status === "evidence_unavailable" || result.reason === "evidence_unavailable") {
    return "evidence_unavailable";
  }
  if (result.detail === "legacy_unverified_evidence") return "unable";
  if (
    result.status === "verified"
    && (result.reason === undefined || result.reason === "valid")
  ) {
    return "verified";
  }
  if (
    result.status === "ledger_missing"
    || result.status === "ledger_unavailable"
    || result.status === "not_found"
  ) {
    return "unable";
  }
  return "failed";
}

/** Human-readable verify failure / pending detail. Never invents success. */
export function formatSsiVerifyDetail(
  result: LedgerVerifyResult | null | undefined,
  state: SsiVerifyUiState,
): string | null {
  if (!result || state === "verified" || state === "loading" || state === "idle") return null;

  const reason = asText(result.reason)?.replace(/_/g, " ") ?? null;
  const byStatus: Partial<Record<string, string>> = {
    pending_anchor: "Signed credential is waiting for a ledger anchor.",
    evidence_unavailable: "Linked evidence files could not be re-checked from storage.",
    ledger_missing: "Credential was marked anchored but was not found on the ledger.",
    ledger_unavailable: "Ledger verification is temporarily unavailable.",
    not_found: "No issued credential record matched this share.",
    tampered: "Document hash or signature checks failed.",
    revoked: "Credential or share revocation is in effect.",
  };

  const statusHint = byStatus[result.status];
  if (statusHint) {
    if (reason && reason !== "valid" && reason !== result.status.replace(/_/g, " ")) {
      return `${statusHint} (${reason})`;
    }
    return statusHint;
  }

  if (reason && reason !== "valid") return reason;
  return null;
}

export type SsiVerifyFinding = {
  label: string;
  detail: string;
  ok: boolean;
};

const CHECK_PASS: Record<string, Record<string, string>> = {
  document: { valid: "Credential document hash matches the stored record." },
  signature: { valid: "Digital signature is valid." },
  holder: { bound: "Holder binding matches the credential subject." },
  evidence: { match: "Evidence hashes match the issued credential.", legacy: "Legacy evidence accepted without live re-hash." },
  issuer: { trusted: "Issuer authenticity check passed." },
  anchor: { match: "Ledger anchor hash matches." },
  revocation: { active: "Credential is not revoked." },
  zkp: { valid: "Threshold proof verified.", not_applicable: "No threshold proof required for this credential." },
};

const CHECK_FAIL: Record<string, Record<string, string>> = {
  document: {
    invalid: "Credential document does not match the stored hash.",
    missing: "Credential document is missing.",
  },
  signature: {
    invalid: "Digital signature is invalid.",
    missing: "No signature proof was found on the credential.",
  },
  holder: {
    mismatch: "Holder DID does not match the credential subject.",
    missing: "Holder DID could not be confirmed.",
  },
  evidence: {
    mismatch: "Evidence hashes no longer match the issued credential.",
    unavailable: "Supporting evidence files could not be re-checked from storage.",
  },
  issuer: {
    untrusted: "Issuer authenticity check failed.",
  },
  anchor: {
    missing: "Credential was marked anchored but was not found on the ledger.",
    hash_mismatch: "Ledger hash does not match the credential.",
    pending: "Ledger anchor is still pending.",
    unavailable: "Ledger verification is temporarily unavailable.",
  },
  revocation: {
    revoked: "Credential or share has been revoked.",
    pending: "Revocation is pending on the ledger.",
  },
  zkp: {
    invalid: "Threshold proof check failed.",
  },
};

/**
 * Organized pass/fail findings for the result panel. Never invents a successful check.
 */
export function buildSsiVerifyFindings(
  result: LedgerVerifyResult | null | undefined,
  state: SsiVerifyUiState,
  fallbackDetail?: string | null,
): SsiVerifyFinding[] {
  if (state === "idle" || state === "loading") return [];

  const findings: SsiVerifyFinding[] = [];
  const checks = result?.checks;

  if (checks) {
    (["document", "signature", "holder", "evidence", "issuer", "anchor", "revocation", "zkp"] as const).forEach((key) => {
      const value = checks[key];
      if (!value || value === "not_checked") return;
      const pass = CHECK_PASS[key]?.[value];
      const fail = CHECK_FAIL[key]?.[value];
      if (pass) {
        findings.push({ label: titleCaseCheck(key), detail: pass, ok: true });
        return;
      }
      if (fail) {
        findings.push({ label: titleCaseCheck(key), detail: fail, ok: false });
        return;
      }
      if (state !== "verified") {
        findings.push({
          label: titleCaseCheck(key),
          detail: `${value.replace(/_/g, " ")}`,
          ok: false,
        });
      }
    });
  }

  const summary = formatSsiVerifyDetail(result, state) ?? fallbackDetail;
  if (state !== "verified" && summary && !findings.some((item) => item.detail === summary)) {
    findings.unshift({
      label: "Reason",
      detail: summary,
      ok: false,
    });
  }

  if (state === "verified" && findings.length === 0) {
    findings.push({
      label: "Result",
      detail: "Signature, issuer authenticity, and credential status were confirmed.",
      ok: true,
    });
  }

  if (state !== "verified" && findings.length === 0) {
    findings.push({
      label: "Result",
      detail: summary || ssiVerifyStateHint(state),
      ok: false,
    });
  }

  return findings;
}

function titleCaseCheck(key: string): string {
  if (key === "zkp") return "ZKP";
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ssiVerifyStateLabel(state: SsiVerifyUiState): string {
  switch (state) {
    case "loading":
      return "Verifying…";
    case "verified":
      return "Verified";
    case "failed":
      return "Failed";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "pending_anchor":
      return "Pending Anchor";
    case "evidence_unavailable":
      return "Evidence Unavailable";
    case "unable":
      return "Unable to Verify";
    default:
      return "Not checked";
  }
}

export function ssiVerifyStateHint(state: SsiVerifyUiState): string {
  switch (state) {
    case "verified":
      return "Backend confirmed signature, issuer authenticity, and credential status.";
    case "failed":
      return "Integrity or signature checks did not pass.";
    case "expired":
      return "This share has expired. Verification is no longer available.";
    case "revoked":
      return "The share or credential was revoked.";
    case "pending_anchor":
      return "Local signature checks can pass, but the credential is not ledger-anchored yet.";
    case "evidence_unavailable":
      return "The credential record was found, but supporting evidence could not be re-hashed.";
    case "unable":
      return "Verification could not be completed for this shared credential.";
    case "loading":
      return "Checking digital signature, issuer, and status…";
    default:
      return "Run SSI verification against the shared credential record.";
  }
}

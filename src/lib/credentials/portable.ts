/**
 * Learner-held copy of an issued SIJIL credential.
 * The signed document is stored beside its original proof and hash.
 * A copy in this browser is not proof that the credential is still valid.
 */
import { canonicalizeJson } from "@/lib/ssi/canonicalize";

export const PORTABLE_CREDENTIAL_FORMAT = "SIJIL-CREDENTIAL-v1";

export type PortableCredentialProof = {
  type: string;
  cryptosuite: string;
  created: string;
  verificationMethod: string;
  proofValue: string;
  proofPurpose: string;
};

export type PortableCredentialFile = {
  format: typeof PORTABLE_CREDENTIAL_FORMAT;
  document: Record<string, unknown>;
  proof: PortableCredentialProof;
  credentialHash: string;
};

export type SignatureStatus = "valid" | "invalid" | "unavailable";
export type HolderStatus = "match" | "mismatch" | "unknown";
export type RevocationStatus = "active" | "revoked" | "unknown";
export type BlockchainStatus = "anchored" | "pending" | "missing" | "unavailable" | "unknown";

export type LiveCredentialStatus = {
  source: "checked" | "unavailable";
  revocation: RevocationStatus;
  blockchain: BlockchainStatus;
  integrity: "ok" | "failed" | "unknown";
};

const SECRET_KEY = /privatekey|private_key|service_role|access_token|refresh_token|client_secret/i;
const SECRET_TEXT = /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|service_role/;

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return SECRET_TEXT.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    return SECRET_KEY.test(key) || containsSecret(nested);
  });
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("This is not a valid credential file");
  }
  return value;
}

export function portableCredential(input: {
  document: Record<string, unknown>;
  proof: PortableCredentialProof;
  credentialHash: string;
}): PortableCredentialFile {
  const file: PortableCredentialFile = {
    format: PORTABLE_CREDENTIAL_FORMAT,
    document: input.document,
    proof: { ...input.proof },
    credentialHash: input.credentialHash,
  };
  if (containsSecret(file) || !/^[0-9a-f]{64}$/.test(file.credentialHash)) {
    throw new Error("This credential file cannot be saved");
  }
  return file;
}

export function serializePortableCredential(file: PortableCredentialFile): string {
  const raw = JSON.stringify(file, null, 2);
  if (containsSecret(raw)) throw new Error("Refusing to download this credential");
  return raw;
}

export function parsePortableCredential(raw: string): PortableCredentialFile {
  if (containsSecret(raw)) throw new Error("This file contains material that cannot be imported");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("This is not a valid credential file");
  }
  const row = parsed as Record<string, unknown>;
  if (row.format !== PORTABLE_CREDENTIAL_FORMAT) {
    throw new Error("This is not a SIJIL credential file");
  }
  if (!row.document || typeof row.document !== "object" || Array.isArray(row.document)) {
    throw new Error("This credential file has no signed document");
  }
  if (!row.proof || typeof row.proof !== "object" || Array.isArray(row.proof)) {
    throw new Error("This credential file has no signature");
  }
  const proof = row.proof as Record<string, unknown>;
  const file = portableCredential({
    document: row.document as Record<string, unknown>,
    proof: {
      type: textField(proof, "type"),
      cryptosuite: textField(proof, "cryptosuite"),
      created: textField(proof, "created"),
      verificationMethod: textField(proof, "verificationMethod"),
      proofValue: textField(proof, "proofValue"),
      proofPurpose: textField(proof, "proofPurpose"),
    },
    credentialHash: textField(row, "credentialHash"),
  });
  if (file.proof.cryptosuite !== "eddsa-jcs-2022" || file.proof.type !== "DataIntegrityProof") {
    throw new Error("This credential uses an unsupported signature");
  }
  return file;
}

export function credentialId(file: PortableCredentialFile): string {
  return typeof file.document.id === "string" ? file.document.id : "";
}

export function credentialSkill(file: PortableCredentialFile): string {
  const subject = file.document.credentialSubject;
  if (!subject || typeof subject !== "object" || Array.isArray(subject)) return "Achievement";
  const skill = (subject as Record<string, unknown>).skill;
  return typeof skill === "string" && skill.trim() ? skill : "Achievement";
}

export function credentialIssuer(file: PortableCredentialFile): string {
  return typeof file.document.issuer === "string" ? file.document.issuer : "Unknown issuer";
}

export function credentialDates(file: PortableCredentialFile): { issued: string | null; expires: string | null } {
  return {
    issued: typeof file.document.validFrom === "string" ? file.document.validFrom : null,
    expires: typeof file.document.validUntil === "string" ? file.document.validUntil : null,
  };
}

export function credentialFilename(file: PortableCredentialFile): string {
  const slug = credentialSkill(file).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "credential";
  return `sijil-credential-${slug}.json`;
}

export function selectTrustedIssuerKey(
  _file: PortableCredentialFile,
  fetchedPem: string | null,
): string | null {
  return fetchedPem && fetchedPem.includes("BEGIN PUBLIC KEY") ? fetchedPem : null;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s/g, "");
  const bytes = base64UrlToBytes(body);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("spki", copy, { name: "Ed25519" }, false, ["verify"]);
}

export async function verifyPortableCredential(
  file: PortableCredentialFile,
  trustedPublicKeyPem: string | null,
): Promise<SignatureStatus> {
  const trusted = selectTrustedIssuerKey(file, trustedPublicKeyPem);
  if (!trusted) return "unavailable";
  try {
    const hash = await sha256Hex(canonicalizeJson(file.document));
    if (hash !== file.credentialHash) return "invalid";
    const key = await importPublicKey(trusted);
    const signature = base64UrlToBytes(file.proof.proofValue);
    const payload = hexToBytes(hash);
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer,
      payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer,
    );
    return ok ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}

export function holderBinding(file: PortableCredentialFile, learnerDid: string | null): HolderStatus {
  const subject = file.document.credentialSubject;
  const id = subject && typeof subject === "object" && !Array.isArray(subject)
    ? (subject as Record<string, unknown>).id
    : null;
  if (!learnerDid || typeof id !== "string" || !id) return "unknown";
  return id === learnerDid ? "match" : "mismatch";
}

export function interpretVerifyResponse(result: { status: string; hash: string | null } | null): LiveCredentialStatus {
  if (!result || (result.status === "ledger_unavailable" && !result.hash)) {
    return { source: "unavailable", revocation: "unknown", blockchain: "unavailable", integrity: "unknown" };
  }
  switch (result.status) {
    case "verified":
      return { source: "checked", revocation: "active", blockchain: "anchored", integrity: "ok" };
    case "revoked":
      return { source: "checked", revocation: "revoked", blockchain: "unknown", integrity: "ok" };
    case "pending_anchor":
      return { source: "checked", revocation: "active", blockchain: "pending", integrity: "ok" };
    case "ledger_missing":
      return { source: "checked", revocation: "active", blockchain: "missing", integrity: "ok" };
    case "ledger_unavailable":
      return { source: "checked", revocation: "active", blockchain: "unavailable", integrity: "ok" };
    case "tampered":
      return { source: "checked", revocation: "unknown", blockchain: "unknown", integrity: "failed" };
    default:
      return { source: "checked", revocation: "unknown", blockchain: "unknown", integrity: "unknown" };
  }
}

export function credentialStatusCopy(input: {
  signature: SignatureStatus;
  revocation: RevocationStatus;
  blockchain: BlockchainStatus;
  holder: HolderStatus;
  integrity?: "ok" | "failed" | "unknown";
}): string {
  if (input.integrity === "failed") return "SIJIL reports that this credential does not match its stored record. It is not currently valid.";
  if (input.holder === "mismatch") return "This credential is for a different learning identity.";
  if (input.signature === "invalid") return "The signature or document does not match. It was not accepted as authentic.";
  if (input.signature === "unavailable") return "The signature could not be checked. A saved copy is not proof that it is authentic.";
  if (input.revocation === "revoked") return "This credential is revoked. It is not currently valid.";
  if (input.revocation !== "active" || input.blockchain === "unknown" || input.blockchain === "unavailable") {
    return "The signature checks out. Current revocation or blockchain status could not be confirmed.";
  }
  if (input.blockchain === "anchored") return "The signature checks out. SIJIL currently lists it as active, and the blockchain record matches.";
  if (input.blockchain === "pending") return "The signature checks out. SIJIL currently lists it as active. A blockchain record is not ready.";
  return "The signature checks out. SIJIL currently lists it as active. The blockchain record is missing.";
}

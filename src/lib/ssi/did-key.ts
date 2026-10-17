/**
 * did:key for Ed25519 (multicodec ed25519-pub 0xed01, multibase base58btc).
 * Spec: https://w3c-ccg.github.io/did-method-key/#ed25519-x25519
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_PUB_PREFIX = new Uint8Array([0xed, 0x01]);
const RAW_KEY_BYTES = 32;
const MULTICODEC_BYTES = 34;

export const DID_KEY_PREFIX = "did:key:z";

export function base58btcEncode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const size = Math.ceil((bytes.length * 138) / 100) + 1;
  const encoded = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 256 * encoded[k];
      encoded[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }
  let offset = size - length;
  while (offset < size && encoded[offset] === 0) offset += 1;
  let out = "1".repeat(zeros);
  for (; offset < size; offset += 1) out += BASE58_ALPHABET[encoded[offset]];
  return out;
}

export function base58btcDecode(text: string): Uint8Array {
  if (!text) return new Uint8Array();
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros += 1;
  const size = Math.ceil((text.length * 733) / 1000) + 1;
  const decoded = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < text.length; i += 1) {
    const value = BASE58_ALPHABET.indexOf(text[i]);
    if (value < 0) throw new Error("Invalid base58btc character");
    let carry = value;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 58 * decoded[k];
      decoded[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    length = j;
  }
  let offset = size - length;
  while (offset < size && decoded[offset] === 0) offset += 1;
  const out = new Uint8Array(zeros + (size - offset));
  out.fill(0, 0, zeros);
  out.set(decoded.subarray(offset), zeros);
  return out;
}

export function encodeDidKeyFromRawPublicKey(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.byteLength !== RAW_KEY_BYTES) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const prefixed = new Uint8Array(MULTICODEC_BYTES);
  prefixed.set(ED25519_PUB_PREFIX, 0);
  prefixed.set(rawPublicKey, 2);
  return `${DID_KEY_PREFIX}${base58btcEncode(prefixed)}`;
}

export type ResolvedDidKey = {
  did: string;
  publicKey: Uint8Array;
  publicKeyMultibase: string;
  verificationMethod: string;
};

export function resolveDidKey(did: string): ResolvedDidKey {
  const trimmed = did.trim();
  if (!trimmed.startsWith(DID_KEY_PREFIX)) {
    throw new Error("Unsupported DID method (expected did:key with base58btc)");
  }
  const multibase = trimmed.slice("did:key:".length);
  if (!multibase.startsWith("z") || multibase.length < 8) {
    throw new Error("did:key must use base58btc multibase");
  }
  const decoded = base58btcDecode(multibase.slice(1));
  if (decoded.byteLength !== MULTICODEC_BYTES || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("did:key is not an Ed25519 public key");
  }
  const publicKey = decoded.slice(2);
  const publicKeyMultibase = multibase;
  return {
    did: trimmed,
    publicKey,
    publicKeyMultibase,
    verificationMethod: `${trimmed}#${publicKeyMultibase}`,
  };
}

export function isDidKeyEd25519(did: string | null | undefined): boolean {
  if (!did) return false;
  try {
    resolveDidKey(did);
    return true;
  } catch {
    return false;
  }
}

/** UUID-derived placeholder used before Phase 1 (`did:key:z6Mk` + hex uuid). */
export function isLegacyPlaceholderDid(did: string | null | undefined): boolean {
  if (!did) return false;
  if (!/^did:key:z6Mk[0-9a-f]{40}$/i.test(did.trim())) return false;
  return !isDidKeyEd25519(did);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publicKeyFingerprint(rawPublicKey: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(rawPublicKey.byteLength);
  new Uint8Array(copy).set(rawPublicKey);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  const hex = bytesToHex(new Uint8Array(digest)).slice(0, 16);
  return hex.match(/.{2}/g)?.join(":") ?? hex;
}

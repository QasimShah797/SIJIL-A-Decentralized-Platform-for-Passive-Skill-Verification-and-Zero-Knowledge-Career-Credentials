/**
 * Passphrase-wrapped Ed25519 vault (PBKDF2-SHA-256 + AES-GCM).
 * Private keys are never stored in plaintext. Forgotten passphrases cannot be recovered.
 */
import { encodeDidKeyFromRawPublicKey, publicKeyFingerprint, resolveDidKey } from "./did-key";
import {
  identityFromKeyPair,
  isUsablePrivateKey,
  type StoredSsiIdentity,
} from "./keystore";

export const SSI_VAULT_FORMAT = "SIJIL-SSI-VAULT-v1";
export const SSI_PBKDF2_ITERATIONS = 310_000;
export const SSI_PASSPHRASE_MIN = 10;

export type VaultKdfParams = {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
};

export type VaultWrap = {
  alg: "AES-GCM";
  iv: string;
  ciphertext: string;
  kdf: VaultKdfParams;
};

export type EncryptedSsiBackup = {
  format: typeof SSI_VAULT_FORMAT;
  userId: string;
  did: string;
  fingerprint: string;
  createdAt: string;
  wrap: VaultWrap;
};

function fail(message: string): never {
  throw new Error(message);
}

export function assertPassphrase(passphrase: string): string {
  if (typeof passphrase !== "string" || passphrase.length < SSI_PASSPHRASE_MIN) {
    fail(`Passphrase must be at least ${SSI_PASSPHRASE_MIN} characters`);
  }
  if (passphrase.trim() !== passphrase) fail("Passphrase cannot start or end with whitespace");
  return passphrase;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const copy = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(copy);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const saltCopy = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltCopy).set(salt);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations, salt: saltCopy },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateWrappableLearnerKeyPair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" } as AlgorithmIdentifier,
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  if (!pair.privateKey.extractable) {
    fail("Browser produced a non-exportable key; passphrase backup requires a wrappable key");
  }
  return pair;
}

export async function wrapPrivateKey(privateKey: CryptoKey, passphrase: string): Promise<VaultWrap> {
  assertPassphrase(passphrase);
  if (!privateKey.extractable) {
    fail("This identity uses a non-extractable key and cannot be passphrase-wrapped or backed up");
  }
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aes = await deriveAesKey(passphrase, salt, SSI_PBKDF2_ITERATIONS);
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);
  const ivBuf = new ArrayBuffer(iv.byteLength);
  new Uint8Array(ivBuf).set(iv);
  const pkcs8Buf = new ArrayBuffer(pkcs8.byteLength);
  new Uint8Array(pkcs8Buf).set(pkcs8);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    aes,
    pkcs8Buf,
  ));
  return {
    alg: "AES-GCM",
    iv: bytesToB64url(iv),
    ciphertext: bytesToB64url(ciphertext),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: SSI_PBKDF2_ITERATIONS,
      salt: bytesToB64url(salt),
    },
  };
}

async function decryptPkcs8(wrap: VaultWrap, passphrase: string): Promise<ArrayBuffer> {
  assertPassphrase(passphrase);
  if (wrap.alg !== "AES-GCM" || wrap.kdf?.name !== "PBKDF2" || wrap.kdf.hash !== "SHA-256") {
    fail("Unsupported vault wrap");
  }
  if (wrap.kdf.iterations < 100_000) fail("Vault KDF iterations are too low");
  try {
    const salt = b64urlToBytes(wrap.kdf.salt);
    const iv = b64urlToBytes(wrap.iv);
    const ciphertext = b64urlToBytes(wrap.ciphertext);
    const aes = await deriveAesKey(passphrase, salt, wrap.kdf.iterations);
    const ivBuf = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuf).set(iv);
    const ctBuf = new ArrayBuffer(ciphertext.byteLength);
    new Uint8Array(ctBuf).set(ciphertext);
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, aes, ctBuf);
  } catch (err) {
    if (err instanceof Error && /Passphrase|Unsupported|iterations/.test(err.message)) throw err;
    fail("Incorrect passphrase");
  }
}

export async function unwrapToSigningKey(wrap: VaultWrap, passphrase: string): Promise<CryptoKey> {
  const pkcs8 = await decryptPkcs8(wrap, passphrase);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" } as AlgorithmIdentifier,
    false,
    ["sign"],
  );
  if (key.extractable) fail("Unwrapped signing key must be non-extractable in memory");
  return key;
}

export async function rewrapVault(
  wrap: VaultWrap,
  currentPassphrase: string,
  nextPassphrase: string,
): Promise<VaultWrap> {
  const pkcs8 = await decryptPkcs8(wrap, currentPassphrase);
  const extractable = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" } as AlgorithmIdentifier,
    true,
    ["sign"],
  );
  return wrapPrivateKey(extractable, nextPassphrase);
}

export async function identityFromWrappablePair(
  userId: string,
  pair: CryptoKeyPair,
  passphrase: string,
  now = () => new Date().toISOString(),
): Promise<{ identity: StoredSsiIdentity; backup: EncryptedSsiBackup }> {
  if (!pair.privateKey.extractable) {
    fail("Passphrase vault requires a wrappable key pair");
  }
  const publicView = await identityFromKeyPair(userId, pair, now);
  const wrap = await wrapPrivateKey(pair.privateKey, passphrase);
  const signingKey = await unwrapToSigningKey(wrap, passphrase);
  const identity: StoredSsiIdentity = { ...publicView, privateKey: signingKey };
  return {
    identity,
    backup: {
      format: SSI_VAULT_FORMAT,
      userId,
      did: identity.did,
      fingerprint: identity.fingerprint,
      createdAt: identity.createdAt,
      wrap,
    },
  };
}

export async function unlockBackup(
  backup: EncryptedSsiBackup,
  passphrase: string,
): Promise<StoredSsiIdentity> {
  if (backup.format !== SSI_VAULT_FORMAT) fail("Not a SIJIL SSI vault backup");
  const privateKey = await unwrapToSigningKey(backup.wrap, passphrase);
  if (!isUsablePrivateKey(privateKey)) fail("Restored key is not usable");
  const raw = resolveDidKey(backup.did).publicKey;
  const fingerprint = await publicKeyFingerprint(raw);
  if (fingerprint !== backup.fingerprint) fail("Backup fingerprint does not match DID");
  return {
    userId: backup.userId,
    did: backup.did,
    fingerprint: backup.fingerprint,
    createdAt: backup.createdAt,
    privateKey,
  };
}

export function parseBackupJson(raw: string): EncryptedSsiBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("Backup file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") fail("Backup file is malformed");
  const row = parsed as EncryptedSsiBackup;
  if (row.format !== SSI_VAULT_FORMAT) fail("Not a SIJIL SSI vault backup");
  if (typeof row.did !== "string" || typeof row.userId !== "string") fail("Backup is missing DID metadata");
  if (!row.wrap?.ciphertext || !row.wrap.kdf?.salt) fail("Backup is missing wrapped key material");
  return row;
}

export { encodeDidKeyFromRawPublicKey };

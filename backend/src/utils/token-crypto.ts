/**
 * AES-256-GCM helpers for Google Calendar OAuth tokens at rest.
 * Never log plaintext or ciphertext payloads that contain tokens.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_SALT = Buffer.from("sijil-google-calendar-token-v1", "utf8");

export function deriveTokenEncryptionKey(secret: string): Buffer {
  if (!secret || secret.trim().length < 32) {
    throw new Error("Token encryption key must be at least 32 characters");
  }
  return scryptSync(secret.trim(), SCRYPT_SALT, KEY_LENGTH);
}

/** Encrypt a secret string. Output: v1.<base64url(iv|tag|ciphertext)>. */
export function encryptSecret(plaintext: string, secret: string): string {
  if (!plaintext) throw new Error("Cannot encrypt empty secret");
  const key = deriveTokenEncryptionKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]);
  return `${VERSION}.${packed.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  const [version, body] = payload.split(".");
  if (version !== VERSION || !body) {
    throw new Error("Unsupported encrypted token format");
  }
  const packed = Buffer.from(body, "base64url");
  if (packed.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted token payload is truncated");
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = deriveTokenEncryptionKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Redact anything that looks like a bearer/refresh token before logging. */
export function redactSecretsForLog(value: string): string {
  return value
    .replace(/ya29\.[A-Za-z0-9._~+/-]+/g, "[redacted_access_token]")
    .replace(/1\/\/[A-Za-z0-9_\-]+/g, "[redacted_refresh_token]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
}

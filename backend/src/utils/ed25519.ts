/**
 * Ed25519 sign/verify over a SHA-256 digest (node:crypto). No env access.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export function decodeIssuerPem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) {
    return trimmed;
  }
  return Buffer.from(trimmed, "base64").toString("utf8").trim();
}

export function signSha256Hash(hashHex: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(hashHex, "hex"), key);
  return signature.toString("base64url");
}

export function verifySha256Hash(
  hashHex: string,
  proofValue: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(hashHex, "hex"), key, Buffer.from(proofValue, "base64url"));
  } catch {
    return false;
  }
}
